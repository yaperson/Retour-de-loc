import jsPDF from 'jspdf'
import 'jspdf-autotable'

export const generatePDF = async (store, mode, sendToBackend = false) => {
  // Initialisation du PDF A4
  const doc = new jsPDF()
  
  // Titre
  const dt = new Date()
  const dateStr = dt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
  const typeText = store.typeMateriel ? store.typeMateriel.toUpperCase() : 'Non spécifié'
  
  doc.setFontSize(16)
  doc.setTextColor(14, 165, 233) // Bleu primaire
  doc.text(`Rapport de contrôle - ${typeText} [${store.serialNumber || 'N/A'}]`, 14, 20)
  
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(`Date : ${dateStr} - Mode : ${mode.toUpperCase()}`, 14, 28)

  let yPos = 40

  // Infos clients
  if (mode === 'home') {
    doc.setFontSize(12)
    doc.setTextColor(30, 41, 59)
    doc.text("Informations client", 14, yPos)
    yPos += 8
    doc.setFontSize(10)
    doc.text(`Nom : ${store.clientName || 'Non renseigné'}`, 14, yPos)
    yPos += 6
    doc.text(`Adresse : ${store.clientAddress || 'Non renseignée'}`, 14, yPos)
    yPos += 6
    doc.text(`Acquisition coussin/matelas : ${store.latestPositioningAcquisition || 'N/A'}`, 14, yPos)
    yPos += 12
  } else if (mode === 'sav') {
    doc.setFontSize(12)
    doc.setTextColor(30, 41, 59)
    doc.text(`Usager : ${store.clientNameSav || 'Non renseigné'}`, 14, yPos)
    yPos += 12
  }

  // Tableaux dynamiques
  // 1. SAV Questions
  if (mode === 'sav' && Object.keys(store.savAnswers).length > 0) {
    const tableData = Object.entries(store.savAnswers).map(([k, v]) => [`Question ${parseInt(k)+1}`, v])
    doc.autoTable({
      startY: yPos,
      head: [['Question à la réception', 'Réponse']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [14, 165, 233] },
      styles: { fontSize: 9 }
    })
    yPos = doc.lastAutoTable.finalY + 10
  }

  // 2. Etat Elements
  if (Object.keys(store.etatAnswers).length > 0) {
    const tableData = Object.entries(store.etatAnswers).map(([k, v]) => {
      // k est '0', '1', etc. On pourrait retrouver le nom exact si on passait la liste,
      // pour simplifier on met "Element X". 
      // Une amélioration serait de stocker le texte complet de l'élément dans le store.
      return [`Élément ${parseInt(k)+1}`, v]
    })
    doc.autoTable({
      startY: yPos,
      head: [['État des éléments', 'Statut']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11] }, // Warning orange
      styles: { fontSize: 9 }
    })
    yPos = doc.lastAutoTable.finalY + 10
  }

  // 3. General Questions
  if (Object.keys(store.generalAnswers).length > 0) {
    const tableData = Object.entries(store.generalAnswers).map(([k, v]) => [`Question ${parseInt(k)+1}`, v])
    doc.autoTable({
      startY: yPos,
      head: [['Contrôle Général', 'Réponse']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }, // Success green
      styles: { fontSize: 9 }
    })
    yPos = doc.lastAutoTable.finalY + 10
  }

  // Notes
  if (store.notes) {
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12)
    doc.setTextColor(30, 41, 59)
    doc.text("Notes", 14, yPos)
    yPos += 8
    doc.setFontSize(10)
    const splitNotes = doc.splitTextToSize(store.notes, 180)
    doc.text(splitNotes, 14, yPos)
    yPos += (splitNotes.length * 5) + 10
  }

  // Photos (Gestion basique des DataURL)
  const addPhoto = (title, dataUrl) => {
    if (dataUrl) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(11)
      doc.text(title, 14, yPos)
      try {
        // Ajout d'image. On suppose PNG ou JPG depuis le canvas/file reader
        doc.addImage(dataUrl, 'JPEG', 14, yPos + 4, 80, 60) // Dimensions max 80x60
        yPos += 70
      } catch (e) {
        console.warn("Erreur ajout photo au PDF", e)
        doc.text("(Erreur d'intégration de l'image)", 14, yPos + 10)
        yPos += 20
      }
    }
  }

  addPhoto("Photo Ensemble", store.photoEnsemble)
  addPhoto("Photo Étiquette", store.photoEtiquette)
  addPhoto("Photo Détails", store.photoDetails)

  // Signature
  if (store.signatureData) {
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    doc.setFontSize(11)
    doc.text("Signature", 14, yPos)
    doc.addImage(store.signatureData, 'PNG', 14, yPos + 4, 60, 30)
    yPos += 40
  }

  // Action finale
  if (sendToBackend) {
    try {
      const pdfBlob = doc.output('blob')
      const formData = new FormData()
      formData.append('file', pdfBlob, `rapport-${store.serialNumber || 'SN'}-${Date.now()}.pdf`)
      formData.append('subject', `Rapport ${store.serialNumber || 'SN'} - ${dateStr}`)
      formData.append('text', 'Rapport PDF structuré en pièce jointe.')
      formData.append('to', 'contact@hopicile.fr')

      const res = await fetch('http://localhost:3000/send-report', {
        method: 'POST',
        body: formData
      })
      const result = await res.json()
      if (result.success) {
        return { success: true, message: "Rapport envoyé par mail !" }
      } else {
        return { success: false, message: "Échec de l'envoi : " + result.error }
      }
    } catch (err) {
      return { success: false, message: "Erreur serveur : " + err.message }
    }
  } else {
    // Just download
    doc.save(`rapport-${store.serialNumber || 'SN'}.pdf`)
    return { success: true, message: "Téléchargement lancé." }
  }
}
