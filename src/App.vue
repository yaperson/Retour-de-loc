<script setup>
import { ref, onMounted } from 'vue'
import { useFormStore } from './stores/form'
import BarcodeScanner from './components/BarcodeScanner.vue'
import SignaturePad from './components/SignaturePad.vue'
import DynamicForm from './components/DynamicForm.vue'

import { generatePDF } from './utils/pdfGenerator'
import { subscribeUserToPush } from './utils/pushService'
import DraftsList from './components/DraftsList.vue'

const store = useFormStore()

const currentTab = ref('form') // 'form' ou 'drafts'

const modes = [
  { id: 'standard', label: 'Standard' },
  { id: 'home', label: 'Domicile' },
  { id: 'sav', label: 'SAV' },
  { id: 'charge', label: 'Maintient de charge' },
]

const isGenerating = ref(false)

onMounted(async () => {
  await store.fetchDraftsList()
  // Si on a un brouillon récent, on pourrait le charger, mais pour l'instant on laisse l'utilisateur choisir.
  if (store.draftsList.length === 0) {
    await store.startNewDraft()
  } else {
    // Charge le plus récent par défaut
    const latest = store.draftsList.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
    await store.loadDraft(latest.id)
  }
})

const handlePhotoUpload = (e, targetRefName) => {
  const file = e.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = () => {
      store[targetRefName] = reader.result
    }
    reader.readAsDataURL(file)
  }
}

const handleDownloadPDF = async () => {
  isGenerating.value = true
  await store.saveCurrentDraft()
  await generatePDF(store, store.currentMode, false)
  isGenerating.value = false
}

const handleSendMail = async () => {
  isGenerating.value = true
  await store.saveCurrentDraft()
  const res = await generatePDF(store, store.currentMode, true)
  alert(res.message)
  isGenerating.value = false
}

const startNew = async () => {
  if (confirm("Commencer un nouveau contrôle vierge ? Le contrôle actuel est sauvegardé dans les brouillons.")) {
    await store.saveCurrentDraft()
    await store.startNewDraft()
  }
}

const handlePushSubscription = async () => {
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    const res = await subscribeUserToPush()
    alert(res.message || res.error)
  } else {
    alert("Permission refusée pour les notifications.")
  }
}
</script>

<template>
  <div>
    <header>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h1 style="margin: 0;">Contrôle Matériel Médical</h1>
        <button type="button" @click="handlePushSubscription" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" title="Activer les notifications">
          🔔
        </button>
      </div>

      <!-- Système d'onglets principaux -->
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem;">
        <button type="button" @click="currentTab = 'form'" :class="{ 'primary': currentTab === 'form' }" style="flex:1; border:none; box-shadow:none; font-weight:bold;">
          📝 Contrôle Actuel
        </button>
        <button type="button" @click="currentTab = 'drafts'" :class="{ 'primary': currentTab === 'drafts' }" style="flex:1; border:none; box-shadow:none; font-weight:bold;">
          📁 Mes Brouillons ({{ store.draftsList.length }})
        </button>
      </div>

      <div v-show="currentTab === 'form'">
        <div style="text-align: center; margin-bottom: 0.5rem;">
          <span style="font-size: 0.875rem; color: var(--text-muted);">Mode d'intervention :</span>
        </div>
        <div class="maintenance-modes">
          <button 
            v-for="mode in modes" 
            :key="mode.id"
            @click="store.currentMode = mode.id"
            :class="{ selected: store.currentMode === mode.id }"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>
    </header>

    <main>
      <div v-if="currentTab === 'drafts'">
        <button type="button" class="action-btn primary" @click="startNew" style="width: 100%; margin-bottom: 1rem;">
          ➕ Démarrer un nouveau contrôle
        </button>
        <DraftsList @load-draft="currentTab = 'form'" />
      </div>

      <div class="card" v-show="currentTab === 'form'">
        <div v-if="store.currentMode === 'home'">
          <div class="form-group">
            <label>Nom du patient</label>
            <input type="text" v-model="store.clientName">
          </div>
          <div class="form-group">
            <label>Adresse</label>
            <input type="text" v-model="store.clientAddress">
          </div>
          <div class="form-group">
            <label>Date d'acquisition matelas ou coussin</label>
            <input type="month" v-model="store.latestPositioningAcquisition" min="2012-01">
          </div>
        </div>

        <div v-if="store.currentMode === 'sav'">
          <div class="form-group">
            <label>Nom de l'usager</label>
            <input type="text" v-model="store.clientNameSav">
          </div>
        </div>

        <!-- Scanner et N° série -->
        <BarcodeScanner @scanned="(code) => store.serialNumber = code" />
        
        <div class="form-group" style="margin-top: 1.5rem;">
          <label>Numéro de série lu ou manuel</label>
          <input type="text" v-model="store.serialNumber">
        </div>

        <!-- Sélection matériel -->
        <div class="form-group">
          <label>Choisir le type de matériel :</label>
          <select v-model="store.typeMateriel">
            <option value="">-- Sélectionner --</option>
            <option value="lit">Lit médicalisé</option>
            <option value="fauteuil_manuel">Fauteuil roulant manuel</option>
            <option value="fauteuil_electrique">Fauteuil roulant électrique</option>
            <option value="leve_personne">Lève-personne / verticalisateur</option>
            <option value="pompe_nutrition">Pompe de nutrition</option>
            <option value="autre">Autre</option>
          </select>
        </div>

        <!-- Questions Dynamiques -->
        <DynamicForm :mode="store.currentMode" />

        <!-- Notes -->
        <div class="form-group" v-if="store.typeMateriel">
          <label>Notes :</label>
          <textarea v-model="store.notes" rows="4"></textarea>
        </div>

        <!-- Photos -->
        <div class="form-group" v-if="store.typeMateriel">
          <label>Photo de l'ensemble :</label>
          <input type="file" accept="image/*" capture="environment" @change="e => handlePhotoUpload(e, 'photoEnsemble')">
          <img v-if="store.photoEnsemble" :src="store.photoEnsemble" style="max-width: 100%; margin-top: 0.5rem; border-radius: var(--radius-md);">
        </div>

        <div class="form-group" v-if="store.typeMateriel">
          <label>Photo de l'étiquette (n° de série) :</label>
          <input type="file" accept="image/*" capture="environment" @change="e => handlePhotoUpload(e, 'photoEtiquette')">
          <img v-if="store.photoEtiquette" :src="store.photoEtiquette" style="max-width: 100%; margin-top: 0.5rem; border-radius: var(--radius-md);">
        </div>

        <div class="form-group" v-if="store.currentMode === 'sav'">
          <label>Photo détails (casse...) :</label>
          <input type="file" accept="image/*" capture="environment" @change="e => handlePhotoUpload(e, 'photoDetails')">
          <img v-if="store.photoDetails" :src="store.photoDetails" style="max-width: 100%; margin-top: 0.5rem; border-radius: var(--radius-md);">
        </div>

        <!-- Signature -->
        <div class="form-group" v-if="store.currentMode === 'home' || store.currentMode === 'sav'" style="margin-top: 2rem;">
          <label style="text-align: center; margin-bottom: 1rem;">Signature du patient / usager</label>
          <SignaturePad v-model="store.signatureData" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem;">
          <button type="button" class="action-btn primary" @click="handleSendMail" :disabled="isGenerating">
            {{ isGenerating ? 'Génération...' : '📧 Envoyer le rapport au SAV' }}
          </button>
          
          <button type="button" class="action-btn" @click="handleDownloadPDF" :disabled="isGenerating">
            ⬇️ Télécharger le PDF
          </button>
          
          <button type="button" class="action-btn" style="color: var(--danger); border-color: var(--danger); margin-top: 1rem;" @click="startNew">
            🗑️ Démarrer un nouveau contrôle
          </button>
        </div>

      </div>
    </main>
  </div>
</template>
