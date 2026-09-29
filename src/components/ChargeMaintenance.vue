<script setup>
import { ref, computed, onMounted } from 'vue'
import BarcodeScanner from './BarcodeScanner.vue'
import {
  fetchDevices,
  fetchDeviceBySerial,
  createDevice,
  chargeDevice,
  sendTestPush,
  triggerChargeCheck
} from '../utils/api'
import { subscribeUserToPush } from '../utils/pushService'

// Onglets internes : 'scan' (scanner/fiche) ou 'list' (dashboard du parc)
const activeView = ref('scan')

// États de recherche & scan
const scannedSerial = ref('')
const isSearching = ref(false)
const searchError = ref('')
const currentDevice = ref(null)
const isNewDevice = ref(false)

// Liste globale des appareils pour le dashboard
const devicesList = ref([])
const isLoadingList = ref(false)
const selectedCategoryFilter = ref('all') // 'all', 'Location', 'Démo'
const selectedStatusFilter = ref('all') // 'all', 'overdue', 'warning', 'ok'
const listSearchTerm = ref('')

// Formulaire nouvel appareil
const newDeviceForm = ref({
  serialNumber: '',
  type: 'leve_personne',
  brand: '',
  model: '',
  category: 'Location',
  intervalDays: 30,
  photoUrl: null,
  notes: '',
  operator: 'Commercial / Atelier'
})

// Options de types d'appareils
const typeOptions = [
  { value: 'leve_personne', label: 'Lève-personne', icon: '🏋️' },
  { value: 'verticalisateur', label: 'Verticalisateur', icon: '🧍' },
  { value: 'fauteuil_electrique', label: 'Fauteuil roulant électrique (FRE)', icon: '🧑‍🦽' },
  { value: 'scooter', label: 'Scooter électrique', icon: '🛵' },
  { value: 'lit', label: 'Lit médicalisé électrique', icon: '🛏️' },
  { value: 'pompe_nutrition', label: 'Pompe de nutrition / Perfusion', icon: '💉' },
  { value: 'autre', label: 'Autre matériel à batterie', icon: '🔋' }
]

// Feedback messages
const actionMessage = ref({ type: '', text: '' })
const isSubmitting = ref(false)
const pushStatus = ref(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

const showFeedback = (text, type = 'success') => {
  actionMessage.value = { text, type }
  setTimeout(() => {
    actionMessage.value = { text: '', type: '' }
  }, 4000)
}

// Bip sonore doux lors de la validation d'une charge
const playSuccessBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

// ==========================================
// RECHERCHE / SCAN D'UN APPAREIL
// ==========================================
const handleScan = async (code) => {
  if (!code) return
  scannedSerial.value = code.trim()
  await searchDevice(scannedSerial.value)
}

const searchDevice = async (serial) => {
  if (!serial || !serial.trim()) {
    searchError.value = 'Veuillez saisir ou scanner un numéro de série.'
    return
  }

  searchError.value = ''
  isSearching.value = true
  currentDevice.value = null
  isNewDevice.value = false

  try {
    const device = await fetchDeviceBySerial(serial.trim())
    if (device) {
      currentDevice.value = device
      isNewDevice.value = false
    } else {
      // Non trouvé => mode création
      isNewDevice.value = true
      currentDevice.value = null
      newDeviceForm.value.serialNumber = serial.trim()
      newDeviceForm.value.brand = ''
      newDeviceForm.value.model = ''
      newDeviceForm.value.photoUrl = null
      newDeviceForm.value.notes = ''
    }
  } catch (err) {
    searchError.value = "Impossible de joindre le serveur. Vérifiez que l'API est lancée."
    console.error(err)
  } finally {
    isSearching.value = false
  }
}

// ==========================================
// VALIDATION DE CHARGE ("Appareil chargé")
// ==========================================
const handleMarkAsCharged = async (serial) => {
  if (!serial) return
  isSubmitting.value = true
  try {
    const updated = await chargeDevice(serial, 'Commercial / Atelier', 'Mise en charge effectuée')
    currentDevice.value = updated
    playSuccessBeep()
    showFeedback(`✅ Charge enregistrée avec succès pour le N° ${serial} !`, 'success')
    await loadAllDevices()
  } catch (err) {
    showFeedback(`❌ Erreur : ${err.message}`, 'error')
  } finally {
    isSubmitting.value = false
  }
}

// ==========================================
// PREMIER ENREGISTREMENT D'UN APPAREIL
// ==========================================
const handleCreateAndCharge = async () => {
  if (!newDeviceForm.value.serialNumber) {
    alert('Le numéro de série est obligatoire.')
    return
  }

  isSubmitting.value = true
  try {
    const created = await createDevice({
      ...newDeviceForm.value,
      logNotes: 'Premier enregistrement en base & première mise en charge'
    })
    currentDevice.value = created
    isNewDevice.value = false
    playSuccessBeep()
    showFeedback(`✅ Appareil ${created.brand || ''} ${created.model || ''} créé et chargé !`, 'success')
    await loadAllDevices()
  } catch (err) {
    showFeedback(`❌ Erreur création : ${err.message}`, 'error')
  } finally {
    isSubmitting.value = false
  }
}

// Photo upload pour le nouvel appareil
const handleDevicePhoto = (e) => {
  const file = e.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = () => {
      newDeviceForm.value.photoUrl = reader.result
    }
    reader.readAsDataURL(file)
  }
}

// Réinitialiser la recherche
const resetScan = () => {
  scannedSerial.value = ''
  currentDevice.value = null
  isNewDevice.value = false
  searchError.value = ''
}

// ==========================================
// DASHBOARD & LISTE DU PARC
// ==========================================
const loadAllDevices = async () => {
  isLoadingList.value = true
  try {
    const data = await fetchDevices()
    devicesList.value = data.devices || []
  } catch (err) {
    console.warn("Erreur chargement parc :", err)
  } finally {
    isLoadingList.value = false
  }
}

const filteredDevices = computed(() => {
  return devicesList.value.filter(d => {
    // Filtre catégorie
    if (selectedCategoryFilter.value !== 'all' && d.category !== selectedCategoryFilter.value) {
      return false
    }
    // Filtre statut
    if (selectedStatusFilter.value !== 'all' && d.status !== selectedStatusFilter.value) {
      return false
    }
    // Filtre texte
    if (listSearchTerm.value.trim()) {
      const term = listSearchTerm.value.toLowerCase()
      const matchSerial = (d.serial_number || '').toLowerCase().includes(term)
      const matchBrand = (d.brand || '').toLowerCase().includes(term)
      const matchModel = (d.model || '').toLowerCase().includes(term)
      return matchSerial || matchBrand || matchModel
    }
    return true
  })
})

const stats = computed(() => {
  const overdue = devicesList.value.filter(d => d.status === 'overdue').length
  const warning = devicesList.value.filter(d => d.status === 'warning').length
  const ok = devicesList.value.filter(d => d.status === 'ok').length
  return { overdue, warning, ok, total: devicesList.value.length }
})

// Clic sur un appareil de la liste pour voir sa fiche
const selectDeviceFromList = async (serial) => {
  activeView.value = 'scan'
  scannedSerial.value = serial
  await searchDevice(serial)
}

// ==========================================
// NOTIFICATIONS PUSH & CRON
// ==========================================
const handleEnablePush = async () => {
  const res = await subscribeUserToPush()
  if (res.success) {
    pushStatus.value = 'granted'
    showFeedback(res.message, 'success')
  } else {
    showFeedback(res.error || 'Échec de l\'abonnement push', 'error')
  }
}

const handleTestPush = async () => {
  try {
    const res = await sendTestPush()
    showFeedback(res.message || 'Notification de test envoyée !', 'success')
  } catch (err) {
    showFeedback('Erreur test push : ' + err.message, 'error')
  }
}

const handleCheckCharges = async () => {
  try {
    const res = await triggerChargeCheck()
    showFeedback(res.message || 'Vérification effectuée.', 'info')
    await loadAllDevices()
  } catch (err) {
    showFeedback('Erreur vérification : ' + err.message, 'error')
  }
}

const formatDate = (isoString) => {
  if (!isoString) return 'Inconnue'
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

const getTypeLabel = (typeKey) => {
  const found = typeOptions.find(t => t.value === typeKey)
  return found ? `${found.icon} ${found.label}` : `🔋 ${typeKey}`
}

onMounted(async () => {
  await loadAllDevices()
})
</script>

<template>
  <div class="charge-maintenance-container">

    <!-- Bannière Notification Feedback -->
    <div v-if="actionMessage.text" class="alert-banner" :class="actionMessage.type">
      {{ actionMessage.text }}
    </div>

    <!-- Barre d'outils supérieure : Onglets & Notifications -->
    <div class="sub-nav-bar">
      <div class="sub-nav-tabs">
        <button
          type="button"
          :class="{ active: activeView === 'scan' }"
          @click="activeView = 'scan'"
        >
          ⚡ Scanner / Recharger
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'list' }"
          @click="activeView = 'list'; loadAllDevices();"
        >
          📋 Parc matériel ({{ stats.total }})
          <span v-if="stats.overdue > 0" class="badge-mini danger">{{ stats.overdue }}</span>
        </button>
      </div>

      <!-- Actions Rapides Push -->
      <div class="push-actions">
        <button
          v-if="pushStatus !== 'granted'"
          type="button"
          class="btn-sm btn-outline"
          @click="handleEnablePush"
          title="Activer les alertes push sur cet appareil"
        >
          🔔 Activer alertes
        </button>
        <div v-else class="push-granted-group">
          <span class="badge-pill success">🔔 Alertes actives</span>
          <button type="button" class="btn-xs" @click="handleTestPush" title="Tester la notification">
            Test
          </button>
          <button type="button" class="btn-xs" @click="handleCheckCharges" title="Vérifier les retards maintenant">
            Contrôler
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- VUE 1 : SCAN & GESTION RAPIDE D'UN APPAREIL                    -->
    <!-- ============================================================== -->
    <div v-if="activeView === 'scan'" class="scan-view">

      <!-- Scanner de code-barres / Saisie -->
      <div class="card" v-if="!currentDevice && !isNewDevice">
        <h2 class="card-title">🔍 Identifier l'appareil à charger</h2>
        <p class="card-subtitle">
          Scannez le code-barres de l'appareil (ou saisissez manuellement son numéro de série).
        </p>

        <!-- Scanner photo/caméra intégré -->
        <BarcodeScanner @scanned="handleScan" />

        <div class="manual-input-row" style="margin-top: 1.5rem;">
          <input
            type="text"
            v-model="scannedSerial"
            placeholder="Ex : SN-2024-9842 ou code-barres..."
            @keyup.enter="searchDevice(scannedSerial)"
          />
          <button
            type="button"
            class="action-btn primary"
            :disabled="isSearching || !scannedSerial"
            @click="searchDevice(scannedSerial)"
          >
            {{ isSearching ? 'Recherche...' : 'Valider' }}
          </button>
        </div>

        <div v-if="searchError" class="error-text" style="margin-top: 0.75rem;">
          {{ searchError }}
        </div>
      </div>

      <!-- CAS A : APPAREIL TROUVÉ EN BASE DE DONNÉES -->
      <div v-if="currentDevice" class="device-card card">
        <div class="device-header">
          <div class="device-main-info">
            <span class="type-badge">{{ getTypeLabel(currentDevice.type) }}</span>
            <span class="category-badge" :class="currentDevice.category === 'Démo' ? 'demo' : 'location'">
              {{ currentDevice.category || 'Location' }}
            </span>
            <h2 class="device-name">
              {{ currentDevice.brand || '' }} {{ currentDevice.model || 'Appareil médical' }}
            </h2>
            <div class="device-serial">
              N° de série : <strong>{{ currentDevice.serial_number }}</strong>
            </div>
          </div>

          <div v-if="currentDevice.photo_url" class="device-photo-thumb">
            <img :src="currentDevice.photo_url" alt="Photo appareil" />
          </div>
        </div>

        <!-- Statut de batterie avec indicateur clair -->
        <div class="battery-status-box" :class="currentDevice.status">
          <div class="status-indicator">
            <span v-if="currentDevice.status === 'overdue'" class="status-icon">🔴</span>
            <span v-else-if="currentDevice.status === 'warning'" class="status-icon">🟠</span>
            <span v-else class="status-icon">🟢</span>
            <div class="status-texts">
              <strong v-if="currentDevice.status === 'overdue'">
                Recharge en retard de {{ Math.abs(currentDevice.daysRemaining) }} jour(s) !
              </strong>
              <strong v-else-if="currentDevice.status === 'warning'">
                À recharger dans {{ currentDevice.daysRemaining }} jour(s)
              </strong>
              <strong v-else>
                Batterie à jour (Prochaine charge dans {{ currentDevice.daysRemaining }} jours)
              </strong>
              <div class="charge-meta-dates">
                <span>Dernière charge : <strong>{{ formatDate(currentDevice.last_charge_date) }}</strong></span>
                <span>• Échéance : <strong>{{ formatDate(currentDevice.next_charge_date) }}</strong></span>
                <span>• Cycle : tous les <strong>{{ currentDevice.interval_days }} jours</strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- GROS BOUTON D'ACTION : APPAREIL CHARGÉ -->
        <div class="action-charge-section">
          <button
            type="button"
            class="charge-submit-btn"
            :disabled="isSubmitting"
            @click="handleMarkAsCharged(currentDevice.serial_number)"
          >
            ⚡ APPAREIL CHARGÉ (Mettre à jour)
          </button>
          <p class="charge-hint">
            Cliquez dès que l'appareil a été rechargé ou branché au secteur. Cela réinitialise le délai à {{ currentDevice.interval_days }} jours.
          </p>
        </div>

        <!-- Historique des dernières charges -->
        <div class="charge-history-section">
          <h3>Historique des recharges</h3>
          <div v-if="!currentDevice.logs || currentDevice.logs.length === 0" class="empty-hint">
            Aucun historique précédent enregistré.
          </div>
          <ul v-else class="history-list">
            <li v-for="(log, idx) in currentDevice.logs" :key="log.id || idx" class="history-item">
              <span class="history-date">📅 {{ formatDate(log.charged_at) }}</span>
              <span class="history-op">👤 {{ log.operator || 'Opérateur' }}</span>
              <span v-if="log.notes" class="history-note">💬 {{ log.notes }}</span>
            </li>
          </ul>
        </div>

        <button type="button" class="btn-back" @click="resetScan">
          🔄 Scanner un autre appareil
        </button>
      </div>

      <!-- CAS B : NOUVEL APPAREIL NON TROUVÉ EN BASE (PREMIER SCAN) -->
      <div v-if="isNewDevice" class="new-device-card card">
        <div class="new-device-header">
          <span class="badge-new">✨ Nouveau produit détecté</span>
          <h2>Enregistrement du matériel</h2>
          <p class="subtitle">
            Ce numéro de série n'est pas encore suivi. Renseignez ces quelques informations pour l'ajouter au suivi de maintien de charge.
          </p>
        </div>

        <form @submit.prevent="handleCreateAndCharge" class="new-device-form">
          <div class="form-group">
            <label>Numéro de série lu :</label>
            <input
              type="text"
              v-model="newDeviceForm.serialNumber"
              required
              class="highlight-input"
            />
          </div>

          <div class="form-group">
            <label>Type d'équipement :</label>
            <select v-model="newDeviceForm.type" required>
              <option v-for="t in typeOptions" :key="t.value" :value="t.value">
                {{ t.icon }} {{ t.label }}
              </option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label>Marque :</label>
              <input
                type="text"
                v-model="newDeviceForm.brand"
                placeholder="Ex : Invacare, Arjo, Meyra..."
              />
            </div>
            <div class="form-group flex-1">
              <label>Modèle :</label>
              <input
                type="text"
                v-model="newDeviceForm.model"
                placeholder="Ex : Birdie Evo, Salsa M2..."
              />
            </div>
          </div>

          <div class="form-group">
            <label>Catégorie de parc :</label>
            <div class="radio-pill-group">
              <label :class="{ selected: newDeviceForm.category === 'Location' }">
                <input type="radio" value="Location" v-model="newDeviceForm.category" />
                📦 Matériel Location
              </label>
              <label :class="{ selected: newDeviceForm.category === 'Démo' }">
                <input type="radio" value="Démo" v-model="newDeviceForm.category" />
                ✨ Matériel Démo / Expo
              </label>
              <label :class="{ selected: newDeviceForm.category === 'Atelier' }">
                <input type="radio" value="Atelier" v-model="newDeviceForm.category" />
                🔧 Atelier / Stock
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>Fréquence de charge recommandée :</label>
            <div class="radio-pill-group">
              <label :class="{ selected: newDeviceForm.intervalDays === 14 }">
                <input type="radio" :value="14" v-model="newDeviceForm.intervalDays" />
                2 semaines (14j)
              </label>
              <label :class="{ selected: newDeviceForm.intervalDays === 30 }">
                <input type="radio" :value="30" v-model="newDeviceForm.intervalDays" />
                1 mois (30j - Recommandé)
              </label>
              <label :class="{ selected: newDeviceForm.intervalDays === 60 }">
                <input type="radio" :value="60" v-model="newDeviceForm.intervalDays" />
                2 mois (60j)
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>Photo de l'appareil (Optionnelle) :</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              @change="handleDevicePhoto"
            />
            <div v-if="newDeviceForm.photoUrl" class="photo-preview-box">
              <img :src="newDeviceForm.photoUrl" alt="Aperçu photo" />
            </div>
          </div>

          <div class="form-group">
            <label>Notes / Emplacement :</label>
            <textarea
              v-model="newDeviceForm.notes"
              rows="2"
              placeholder="Ex : Rangé atelier allée 3, batterie neuve..."
            ></textarea>
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="action-btn primary large-btn"
              :disabled="isSubmitting"
            >
              ✅ Enregistrer & Valider la 1ère charge
            </button>
            <button
              type="button"
              class="action-btn"
              @click="resetScan"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>

    </div>

    <!-- ============================================================== -->
    <!-- VUE 2 : TABLEAU DE BORD DU PARC MATÉRIEL (DASHBOARD)           -->
    <!-- ============================================================== -->
    <div v-if="activeView === 'list'" class="dashboard-view">

      <!-- Compteurs Statistiques -->
      <div class="stats-row">
        <div
          class="stat-card danger"
          :class="{ active: selectedStatusFilter === 'overdue' }"
          @click="selectedStatusFilter = selectedStatusFilter === 'overdue' ? 'all' : 'overdue'"
        >
          <span class="stat-number">{{ stats.overdue }}</span>
          <span class="stat-label">🔴 En retard</span>
        </div>
        <div
          class="stat-card warning"
          :class="{ active: selectedStatusFilter === 'warning' }"
          @click="selectedStatusFilter = selectedStatusFilter === 'warning' ? 'all' : 'warning'"
        >
          <span class="stat-number">{{ stats.warning }}</span>
          <span class="stat-label">🟠 Bientôt (≤5j)</span>
        </div>
        <div
          class="stat-card success"
          :class="{ active: selectedStatusFilter === 'ok' }"
          @click="selectedStatusFilter = selectedStatusFilter === 'ok' ? 'all' : 'ok'"
        >
          <span class="stat-number">{{ stats.ok }}</span>
          <span class="stat-label">🟢 À jour</span>
        </div>
      </div>

      <!-- Filtres et Recherche -->
      <div class="filters-card card">
        <div class="filter-controls">
          <input
            type="text"
            v-model="listSearchTerm"
            placeholder="Rechercher par n° de série, marque ou modèle..."
            class="search-input"
          />

          <div class="category-filters">
            <button
              type="button"
              :class="{ selected: selectedCategoryFilter === 'all' }"
              @click="selectedCategoryFilter = 'all'"
            >
              Tous ({{ devicesList.length }})
            </button>
            <button
              type="button"
              :class="{ selected: selectedCategoryFilter === 'Location' }"
              @click="selectedCategoryFilter = 'Location'"
            >
              📦 Location
            </button>
            <button
              type="button"
              :class="{ selected: selectedCategoryFilter === 'Démo' }"
              @click="selectedCategoryFilter = 'Démo'"
            >
              ✨ Démo
            </button>
          </div>
        </div>
      </div>

      <!-- Liste des appareils -->
      <div v-if="isLoadingList" class="loading-state">
        Chargement du parc matériel...
      </div>

      <div v-else-if="filteredDevices.length === 0" class="empty-state card">
        <p>Aucun appareil ne correspond aux filtres sélectionnés.</p>
        <button type="button" class="action-btn" @click="selectedCategoryFilter = 'all'; selectedStatusFilter = 'all'; listSearchTerm = '';">
          Réinitialiser les filtres
        </button>
      </div>

      <div v-else class="devices-grid">
        <div
          v-for="d in filteredDevices"
          :key="d.id"
          class="device-grid-card card"
          :class="d.status"
          @click="selectDeviceFromList(d.serial_number)"
        >
          <div class="grid-card-top">
            <span class="type-pill">{{ getTypeLabel(d.type) }}</span>
            <span class="category-pill" :class="d.category === 'Démo' ? 'demo' : 'location'">
              {{ d.category }}
            </span>
          </div>

          <h3 class="grid-card-title">
            {{ d.brand || '' }} {{ d.model || 'Matériel médical' }}
          </h3>
          <div class="grid-card-serial">
            N° : <strong>{{ d.serial_number }}</strong>
          </div>

          <div class="grid-card-status">
            <span v-if="d.status === 'overdue'" class="status-badge danger">
              🔴 Retard : {{ Math.abs(d.daysRemaining) }}j
            </span>
            <span v-else-if="d.status === 'warning'" class="status-badge warning">
              🟠 Charge sous {{ d.daysRemaining }}j
            </span>
            <span v-else class="status-badge success">
              🟢 OK (dans {{ d.daysRemaining }}j)
            </span>
          </div>

          <div class="grid-card-dates">
            <span>Dernière charge : {{ formatDate(d.last_charge_date) }}</span>
          </div>

          <div class="grid-card-actions" @click.stop>
            <button
              type="button"
              class="btn-fast-charge"
              @click="handleMarkAsCharged(d.serial_number)"
              title="Marquer comme chargé maintenant"
            >
              ⚡ Marquer chargé
            </button>
          </div>
        </div>
      </div>

    </div>

  </div>
</template>

<style scoped>
.charge-maintenance-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Alert Banner */
.alert-banner {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 0.95rem;
  text-align: center;
  animation: fadeIn 0.3s ease;
}
.alert-banner.success { background-color: #dcfce7; color: #166534; border: 1px solid #86efac; }
.alert-banner.error { background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.alert-banner.info { background-color: #e0f2fe; color: #075985; border: 1px solid #bae6fd; }

/* Sub nav */
.sub-nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  background: white;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}
.sub-nav-tabs {
  display: flex;
  gap: 0.5rem;
}
.sub-nav-tabs button {
  border: none;
  background: none;
  padding: 0.5rem 0.75rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  color: var(--text-muted);
}
.sub-nav-tabs button.active {
  background-color: var(--primary-color);
  color: white;
}
.badge-mini {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-size: 0.75rem;
  margin-left: 0.3rem;
}
.badge-mini.danger {
  background: #ef4444;
  color: white;
}

.push-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.push-granted-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.badge-pill {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
}
.badge-pill.success {
  background: #dcfce7;
  color: #166534;
}
.btn-xs {
  font-size: 0.7rem;
  padding: 0.2rem 0.4rem;
}
.btn-sm {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}
.btn-outline {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* Card titles */
.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.card-subtitle {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.manual-input-row {
  display: flex;
  gap: 0.5rem;
}
.manual-input-row input {
  flex: 1;
}

/* Fiche Appareil Trouvé */
.device-card {
  border-left: 6px solid var(--primary-color);
}
.device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.device-name {
  font-size: 1.35rem;
  font-weight: 700;
  margin: 0.4rem 0 0.2rem 0;
}
.device-serial {
  font-size: 0.95rem;
  color: var(--text-muted);
}
.type-badge {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 600;
  background: #f1f5f9;
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-md);
  margin-right: 0.5rem;
}
.category-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-md);
}
.category-badge.location { background: #e0f2fe; color: #0284c7; }
.category-badge.demo { background: #fef3c7; color: #d97706; }

.device-photo-thumb img {
  width: 90px;
  height: 90px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

/* Statut batterie */
.battery-status-box {
  padding: 1rem;
  border-radius: var(--radius-md);
  margin-bottom: 1.5rem;
}
.battery-status-box.ok {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.battery-status-box.warning {
  background-color: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}
.battery-status-box.overdue {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.status-icon {
  font-size: 1.75rem;
}
.status-texts strong {
  display: block;
  font-size: 1.05rem;
}
.charge-meta-dates {
  font-size: 0.85rem;
  margin-top: 0.35rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  color: inherit;
  opacity: 0.9;
}

/* Bouton charge principale */
.action-charge-section {
  text-align: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}
.charge-submit-btn {
  width: 100%;
  max-width: 480px;
  padding: 1rem 1.5rem;
  font-size: 1.15rem;
  font-weight: 700;
  background-color: var(--success);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
  transition: transform 0.1s ease, background-color 0.2s ease;
}
.charge-submit-btn:hover {
  background-color: #059669;
  transform: translateY(-1px);
}
.charge-hint {
  font-size: 0.825rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

/* Historique */
.charge-history-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.history-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem 0;
  max-height: 180px;
  overflow-y: auto;
}
.history-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-color);
  border-radius: var(--radius-md);
  margin-bottom: 0.4rem;
  font-size: 0.85rem;
}
.history-date { font-weight: 600; }
.history-op { color: var(--text-muted); }
.history-note { font-style: italic; color: var(--text-muted); }
.btn-back {
  width: 100%;
}

/* Fiche Nouvel Appareil */
.new-device-card {
  border-left: 6px solid #8b5cf6;
}
.badge-new {
  display: inline-block;
  background: #ede9fe;
  color: #6d28d9;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  margin-bottom: 0.5rem;
}
.highlight-input {
  font-weight: bold;
  background-color: #f8fafc;
}
.form-row {
  display: flex;
  gap: 0.75rem;
}
.flex-1 { flex: 1; }

.radio-pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.radio-pill-group label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}
.radio-pill-group label.selected {
  border-color: var(--primary-color);
  background: #f0f9ff;
  color: var(--primary-color);
  font-weight: 600;
}
.photo-preview-box img {
  max-width: 120px;
  max-height: 120px;
  border-radius: var(--radius-md);
  margin-top: 0.5rem;
}
.large-btn {
  font-size: 1.05rem;
  padding: 0.85rem 1.5rem;
}
.form-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

/* DASHBOARD VUE */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.stat-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
}
.stat-card.active {
  box-shadow: 0 0 0 2px var(--primary-color);
}
.stat-number {
  display: block;
  font-size: 1.6rem;
  font-weight: 800;
}
.stat-card.danger .stat-number { color: #dc2626; }
.stat-card.warning .stat-number { color: #d97706; }
.stat-card.success .stat-number { color: #16a34a; }
.stat-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.filters-card {
  padding: 1rem;
}
.filter-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.search-input {
  width: 100%;
}
.category-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.devices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}
.device-grid-card {
  padding: 1rem;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  position: relative;
  border-left: 5px solid #cbd5e1;
}
.device-grid-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.device-grid-card.overdue { border-left-color: #ef4444; }
.device-grid-card.warning { border-left-color: #f59e0b; }
.device-grid-card.ok { border-left-color: #10b981; }

.grid-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.type-pill {
  font-size: 0.75rem;
  font-weight: 600;
  background: #f1f5f9;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}
.category-pill {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}
.category-pill.location { background: #e0f2fe; color: #0284c7; }
.category-pill.demo { background: #fef3c7; color: #d97706; }

.grid-card-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.grid-card-serial {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.grid-card-status {
  margin-bottom: 0.5rem;
}
.status-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
}
.status-badge.danger { background: #fee2e2; color: #991b1b; }
.status-badge.warning { background: #fef3c7; color: #92400e; }
.status-badge.success { background: #dcfce7; color: #166534; }

.grid-card-dates {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}
.btn-fast-charge {
  width: 100%;
  background: #f0fdf4;
  color: #166534;
  border-color: #86efac;
  font-weight: 600;
}
.btn-fast-charge:hover {
  background: #dcfce7;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
