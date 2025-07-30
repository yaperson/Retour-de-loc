function showUpdateNotification() {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.bottom = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.background = '#333';
    banner.style.color = 'white';
    banner.style.padding = '1rem';
    banner.style.display = 'flex';
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';
    banner.style.zIndex = '9999';
    banner.innerHTML = `
        <span>🔄 Nouvelle version disponible</span>
        <button style="padding:0.5rem 1rem; background:#00c853; color:white; border:none; border-radius:4px; cursor:pointer;">
            Mettre à jour
        </button>
    `;

    banner.querySelector('button').addEventListener('click', () => {
        window.location.reload(); // Recharge l'app avec la nouvelle version
    });

    document.body.appendChild(banner);
}


// Questions générales oui/non
const questionsOuiNon = [
    "Le produit est-il en bon état et est-il complet (produit et accessoires) ?",
    "Le produit présente-t-il des détériorations ou des faiblesses de n'importe quel type ?",
    "Le produit fonctionne-t-il correctement sous charge nominale ?",
    "Le produit est-il complètement fonctionnel conformément au manuel d'utilisation ?",
    "Tous les défauts trouvés ont-ils été éliminés et tous les composants défectueux ont-ils été remplacés ?",
    "Tous les boulons/vis sont-ils fixés correctement et le produit est-il monté correctement ?",
    "Le produit est-il techniquement et fonctionnellement sûr ?",
    "Le produit a-t-il été nettoyé et désinfecté ?",
    "L'autocollant d'identification est-il facilement lisible et est-il fermement apposé sur le produit ?"
];

// Questions état du produit par type matériel (exemple lit, fauteuil manuel)
const etatElements = {
    lit: [
        "Barrières",
        "Potence",
        "Tête et pied de lit",
        "Châssis",
        "Moteur"
    ],
    fauteuil_manuel: [
        "Roues",
        "Accoudoirs",
        "Freins",
        "Repose-pieds",
        "Toiles (assise et dossier)",
        "Châssis"
    ],
    fauteuil_electrique: [
        "Roues",
        "Accoudoirs",
        "Freins",
        "Repose-pieds",
        "Toiles (assise et dossier)",
        "Châssis",
        "Batterie",
        "Moteur"
    ],
    leve_personne: [
        "Structure",
        "Sangles",
        "Moteur",
        "Commande",
        "Roues"
    ],
    autre: [
        "État général des éléments"
    ]
};

const typeSelect = document.getElementById('typeMateriel');
const questionsContainer = document.getElementById('questionsContainer');
const btnSummary = document.getElementById('btnSummary');
const notesContainer = document.getElementById('notes_container');
const notes = document.getElementById('notes');
const photosContainer = document.getElementById('photosContainer');
const photoEnsembleInput = document.getElementById('photoEnsemble');
const photoEtiquetteInput = document.getElementById('photoEtiquette');
const previewEnsemble = document.getElementById('previewEnsemble');
const previewEtiquette = document.getElementById('previewEtiquette');
let serialNumberContainer = document.getElementById("serial_number");
let date = new Date().toLocaleString('fr-FR');

let answers = {}; // stocke réponses des questions
let etatAnswers = {}; // stocke réponses état éléments
let photosData = { ensemble: null, etiquette: null };

// Crée les boutons oui/non
function createYesNoButtons(questionId, container) {
    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'buttons-choices';

    ['Oui', 'Non'].forEach(text => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        
        if (text === "Oui") btn.classList = "validate" 
        else btn.classList = "error"
        
        btn.addEventListener('click', () => {
            answers[questionId] = text;
            // décocher les autres
            Array.from(btnsDiv.children).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            checkAllAnswered();
        });
        btnsDiv.appendChild(btn);
    });
    container.appendChild(btnsDiv);
}

// Crée les boutons état : bon/moyen/mauvais
function createEtatButtons(elementId, container) {
    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'buttons-choices';

    ['Bon (RAS)', 'Moyen (Entretien)', 'Mauvais (HS)'].forEach(text => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;

        if (text === 'Bon (RAS)') btn.classList = "validate" 
        else if (text === 'Moyen (Entretien)') btn.classList = "warning"
        else btn.classList = "error"

        btn.addEventListener('click', () => {
            etatAnswers[elementId] = text;
            Array.from(btnsDiv.children).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            checkAllAnswered();
        });
        btnsDiv.appendChild(btn);
    });
    container.appendChild(btnsDiv);
}

// Affiche les questions + état en fonction du matériel
typeSelect.addEventListener('change', () => {
    answers = {};
    etatAnswers = {};
    btnSummary.disabled = true;
    questionsContainer.innerHTML = '';
    notesContainer.style.display = 'none';
    photosContainer.style.display = 'none';
    previewEnsemble.src = '';
    previewEtiquette.src = '';
    photosData = { ensemble: null, etiquette: null };

    const type = typeSelect.value;
    if (!type) return;

    // Questions oui/non
    questionsOuiNon.forEach((q, i) => {
        const qid = `q${i}`;
        const div = document.createElement('div');
        div.className = 'question';
        const p = document.createElement('p');
        p.textContent = q;
        div.appendChild(p);
        createYesNoButtons(qid, div);
        questionsContainer.appendChild(div);
    });

    // Questions état
    if (etatElements[type]) {
        etatElements[type].forEach((element, i) => {
            const eid = `etat${i}`;
            const div = document.createElement('div');
            div.className = 'question';
            const p = document.createElement('p');
            p.textContent = element;
            div.appendChild(p);
            createEtatButtons(eid, div);
            questionsContainer.appendChild(div);
        });
    }

    notesContainer.style.display = 'block';
    photosContainer.style.display = 'block';
});

// Preview photos
photoEnsembleInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
            previewEnsemble.src = reader.result;
            photosData.ensemble = reader.result;
            checkAllAnswered();
        };
        reader.readAsDataURL(file);
    } else {
        previewEnsemble.src = '';
        photosData.ensemble = null;
        checkAllAnswered();
    }
});

photoEtiquetteInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
            previewEtiquette.src = reader.result;
            photosData.etiquette = reader.result;
            checkAllAnswered();
        };
        reader.readAsDataURL(file);
    } else {
        previewEtiquette.src = '';
        photosData.etiquette = null;
        checkAllAnswered();
    }
});

// Vérifie que toutes les questions ont une réponse + photos sélectionnées
function checkAllAnswered() {
    // Tous les oui/non doivent avoir une réponse
    const qOk = questionsOuiNon.length === Object.keys(answers).length;

    // Tous les états doivent avoir une réponse
    const type = typeSelect.value;
    const etatCount = etatElements[type] ? etatElements[type].length : 0;
    const etatOk = etatCount === Object.keys(etatAnswers).length;

    // Photos obligatoires
    const photosOk = photosData.ensemble !== null && photosData.etiquette !== null;

    btnSummary.disabled = !(qOk && etatOk && photosOk);
}

const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const closeModal = document.getElementById('closeModal');
const btnModalPrint = document.getElementById('btnModalPrint');
const btnModalDownload = document.getElementById('btnModalDownload');
const btnModalShare = document.getElementById('btnModalShare');
const btnModalMail = document.getElementById('btnModalMail');
const endScan = document.getElementById('endScan');
const scannerContainer = document.getElementById('scanner');

// Génère le résumé HTML
function generateSummaryHTML() {
    const type = typeSelect.options[typeSelect.selectedIndex].text;
    const dt = new Date();
    const dateStr = dt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

    let html = `
        <h1>Rapport de contrôle - ${type} [${serialNumberContainer.value}]</h1>
        <p>Date: ${dateStr}</p>
        <h2>Analyse de risque</h2>
        <hr />
        <h2>Questions générales</h2>
    `;

    questionsOuiNon.forEach((q, i) => {
        const qid = `q${i}`;
        const rep = answers[qid] || "Non répondu";
        html += `<div class="question-summary"><strong>${q}</strong><br>Réponse : ${rep}</div>`;
    });

    html += `<hr /><h2>État des éléments</h2>`;
    const typeKey = typeSelect.value;
    if (etatElements[typeKey]) {
        etatElements[typeKey].forEach((el, i) => {
            const eid = `etat${i}`;
            const rep = etatAnswers[eid] || "Non renseigné";
            html += `<div class="question-summary"><strong>${el}</strong><br>État : ${rep}</div>`;
        });
    }

    html += `<hr /><h2>Notes</h2><p>${notes.value.trim() ? notes.value.trim().replace(/\n/g, "<br>") : "Aucune note"}</p>`;

    html += `<hr /><h2>Photos</h2>`;
    if (photosData.ensemble) {
        html += `<p><strong>Photo de l'ensemble :</strong><br><img src="${photosData.ensemble}" alt="Photo de l'ensemble" /></p>`;
    } else {
        html += `<p><strong>Photo de l'ensemble :</strong> Non fournie</p>`;
    }
    if (photosData.etiquette) {
        html += `<p><strong>Photo de l'étiquette :</strong><br><img src="${photosData.etiquette}" alt="Photo de l'étiquette" /></p>`;
    } else {
        html += `<p><strong>Photo de l'étiquette :</strong> Non fournie</p>`;
    }

    return html;
}

// Ouvre la modale avec le résumé
btnSummary.addEventListener('click', () => {
    const html = generateSummaryHTML();
    modalContent.innerHTML = html;
    modal.style.display = 'block';

    // Pour utiliser dans les fonctions print/download/share
    modalContent.dataset.html = html;
});

// Fermer modale
closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Imprimer le contenu de la modale
btnModalPrint.addEventListener('click', () => {
    const html = modalContent.dataset.html || '';
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
                <html><head><title>Impression Rapport</title><meta charset="UTF-8" />
                <style>body{font-family:Arial,sans-serif; max-width:600px; margin:auto; padding:1rem;}
                img{max-width:50vw; margin-top:0.5rem; border:1px solid #ccc; border-radius:5px;}
                h1,h2{text-align:center;}</style>
                </head><body>${html}
            `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
});

btnModalDownload.addEventListener('click', async () => {
    try {
        // S'assurer que toutes les images sont bien chargées
        const images = modalContent.querySelectorAll('img');
        for (const img of images) {
            if (!img.complete) {
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
            }
        }

        // Générer le canvas du contenu
        const canvas = await html2canvas(modalContent, { scale: 2, useCORS: true });

        // Convertir en image PNG
        const imageData = canvas.toDataURL('image/png');

        // Créer un lien de téléchargement
        const a = document.createElement('a');
        a.href = imageData;
        a.download = `${serialNumberContainer.value}-${date.slice(0,10)}.png`;
        a.click();

    } catch (e) {
        alert("Erreur lors du téléchargement de l’image : " + (e.message || e));
    }
});

btnModalShare.addEventListener('click', async () => {
    try {
        const canvas = await html2canvas(modalContent, { scale: 2, useCORS: true });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], `${serialNumberContainer.value}-${date.slice(0,10)}.png`, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'Rapport visuel',
                text: 'Voici le rapport de retour matériel médical.',
                files: [file]
            });
        } else {
            // Fallback : téléchargement
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${serialNumberContainer.value}-${date.slice(0,10)}.png`;
            link.click();
            URL.revokeObjectURL(link.href);
        }
    } catch (err) {
        alert("Erreur lors du partage : " + err.message);
    }
});

// Fermer modale au clic hors contenu
window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});


// Quagga - Lecture Code Bar
let scannerActive = false;

document.getElementById('btnScan').addEventListener('click', () => {
    scannerContainer.innerHTML = ''; // Nettoie avant tout

    if (scannerActive) {
        Quagga.stop();
        scannerActive = false;
        return;
    }

    Quagga.init({
        inputStream: {
            type: "LiveStream",
            target: scannerContainer,
            constraints: {
                facingMode: "environment",
                width: { min: 640 },
                height: { min: 480 }
            },
            area: { // Limite la zone de détection si besoin
                top: "10%",
                right: "10%",
                left: "10%",
                bottom: "10%"
            },
            singleChannel: false // couleur
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        decoder: {
            readers: ["code_128_reader"]
        },
        locate: true, // Permet à Quagga d'améliorer la détection en scannant mieux
    }, function (err) {
        if (err) {
            console.error("Erreur lors de l'init Quagga :", err);
            return;
        }

        Quagga.start();
        scannerActive = true;
        console.log("Scanner démarré !");
    });

    // Dès qu’un code est trouvé
    Quagga.onDetected(result => {
        const code = result.codeResult.code;

        console.log(result)
        console.log("Code barre : " + code)

        serialNumberContainer.value = code;

        // STOP proprement après détection
        Quagga.stop();
        scannerActive = false;
        scannerContainer.innerHTML = '';
    });
});

endScan.addEventListener('click', () => {
    Quagga.stop();
    scannerActive = false;
    scannerContainer.innerHTML = '';
})