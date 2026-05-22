import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import localforage from 'localforage'

export const useFormStore = defineStore('form', () => {
  const currentDraftId = ref(Date.now().toString()) // Identifiant unique pour le brouillon en cours
  const draftsList = ref([]) // Liste des brouillons enregistrés

  // Informations Client
  const clientName = ref('')
  const clientAddress = ref('')
  const clientNameSav = ref('')
  const latestPositioningAcquisition = ref('')

  // Produit
  const serialNumber = ref('')
  const typeMateriel = ref('')
  const signatureData = ref(null)
  
  // Photos
  const photoEnsemble = ref(null)
  const photoEtiquette = ref(null)
  const photoDetails = ref(null)

  // Réponses
  const generalAnswers = ref({})
  const savAnswers = ref({})
  const etatAnswers = ref({})
  const notes = ref('')
  
  const currentMode = ref('standard')

  // Récupérer la liste complète des brouillons
  const fetchDraftsList = async () => {
    const list = await localforage.getItem('drafts_list')
    if (list) {
      draftsList.value = list
    } else {
      draftsList.value = []
    }
  }

  // Sauvegarde explicite/automatique du brouillon courant
  const saveCurrentDraft = async () => {
    if (!currentDraftId.value) {
      currentDraftId.value = Date.now().toString()
    }

    // On deep-clone l'objet complet pour éviter les DataCloneError dues aux Proxies Vue 3
    const draftData = JSON.parse(JSON.stringify({
      id: currentDraftId.value,
      updatedAt: new Date().toISOString(),
      currentMode: currentMode.value,
      clientName: clientName.value,
      clientAddress: clientAddress.value,
      clientNameSav: clientNameSav.value,
      latestPositioningAcquisition: latestPositioningAcquisition.value,
      serialNumber: serialNumber.value,
      typeMateriel: typeMateriel.value,
      signatureData: signatureData.value,
      photoEnsemble: photoEnsemble.value,
      photoEtiquette: photoEtiquette.value,
      photoDetails: photoDetails.value,
      generalAnswers: generalAnswers.value,
      savAnswers: savAnswers.value,
      etatAnswers: etatAnswers.value,
      notes: notes.value
    }))

    // Sauvegarde les données complètes
    await localforage.setItem(`draft_${currentDraftId.value}`, draftData)

    // Met à jour la liste des métadonnées pour l'affichage rapide
    await fetchDraftsList()
    const index = draftsList.value.findIndex(d => d.id === currentDraftId.value)
    
    // Titre affiché dans la liste
    let title = 'Nouveau rapport'
    if (serialNumber.value) title = `SN: ${serialNumber.value}`
    if (clientName.value) title += ` - ${clientName.value}`

    const meta = {
      id: currentDraftId.value,
      title: title,
      updatedAt: draftData.updatedAt,
      mode: currentMode.value
    }

    if (index >= 0) {
      draftsList.value[index] = meta
    } else {
      draftsList.value.push(meta)
    }
    
    await localforage.setItem('drafts_list', JSON.parse(JSON.stringify(draftsList.value)))
  }

  // Charger un brouillon spécifique
  const loadDraft = async (id) => {
    const draft = await localforage.getItem(`draft_${id}`)
    if (draft) {
      currentDraftId.value = draft.id
      currentMode.value = draft.currentMode || 'standard'
      clientName.value = draft.clientName || ''
      clientAddress.value = draft.clientAddress || ''
      clientNameSav.value = draft.clientNameSav || ''
      latestPositioningAcquisition.value = draft.latestPositioningAcquisition || ''
      serialNumber.value = draft.serialNumber || ''
      typeMateriel.value = draft.typeMateriel || ''
      signatureData.value = draft.signatureData || null
      photoEnsemble.value = draft.photoEnsemble || null
      photoEtiquette.value = draft.photoEtiquette || null
      photoDetails.value = draft.photoDetails || null
      generalAnswers.value = draft.generalAnswers || {}
      savAnswers.value = draft.savAnswers || {}
      etatAnswers.value = draft.etatAnswers || {}
      notes.value = draft.notes || ''
    }
  }

  // Effacer un brouillon spécifique
  const deleteDraft = async (id) => {
    await localforage.removeItem(`draft_${id}`)
    await fetchDraftsList()
    draftsList.value = draftsList.value.filter(d => d.id !== id)
    await localforage.setItem('drafts_list', JSON.parse(JSON.stringify(draftsList.value)))
    
    if (currentDraftId.value === id) {
      await startNewDraft()
    }
  }

  // Démarrer un nouveau formulaire vierge
  const startNewDraft = async () => {
    currentDraftId.value = Date.now().toString()
    currentMode.value = 'standard'
    clientName.value = ''
    clientAddress.value = ''
    clientNameSav.value = ''
    latestPositioningAcquisition.value = ''
    serialNumber.value = ''
    typeMateriel.value = ''
    signatureData.value = null
    photoEnsemble.value = null
    photoEtiquette.value = null
    photoDetails.value = null
    generalAnswers.value = {}
    savAnswers.value = {}
    etatAnswers.value = {}
    notes.value = ''
  }

  // Auto-sauvegarde robuste
  let timeout
  watch(
    [clientName, clientAddress, clientNameSav, serialNumber, typeMateriel, notes, generalAnswers, savAnswers, etatAnswers, currentMode],
    () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => { saveCurrentDraft() }, 1500)
    },
    { deep: true }
  )

  return {
    currentDraftId, draftsList, currentMode,
    clientName, clientAddress, clientNameSav, latestPositioningAcquisition,
    serialNumber, typeMateriel, signatureData,
    photoEnsemble, photoEtiquette, photoDetails,
    generalAnswers, savAnswers, etatAnswers, notes,
    fetchDraftsList, saveCurrentDraft, loadDraft, deleteDraft, startNewDraft
  }
})
