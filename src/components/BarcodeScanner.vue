<script setup>
import { ref, onBeforeUnmount, nextTick } from 'vue'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const props = defineProps({
  modelValue: String
})

const emit = defineEmits(['update:modelValue', 'scanned'])

const scannerDivId = 'reader'
const isScanning = ref(false)
const errorMessage = ref('')

// Contrôles matériel de la caméra (anti-grand angle / netteté)
const hasZoom = ref(false)
const zoomMin = ref(1)
const zoomMax = ref(1)
const zoomStep = ref(0.1)
const currentZoom = ref(1)
const zoomPresets = ref([1, 2, 3])

const hasTorch = ref(false)
const isTorchOn = ref(false)

const availableCameras = ref([])
const currentCameraIndex = ref(0)
const currentCameraLabel = ref('')

let html5QrCode = null
let zoomFeature = null
let torchFeature = null

// Bip sonore doux à la détection
const playBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(980, ctx.currentTime)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  } catch {
    // AudioContext restreint si pas d'interaction préalable
  }
}

// Vibration tactile
const vibrateSuccess = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100])
    }
  } catch {
    // ignore
  }
}

const updateCapabilities = async () => {
  if (!html5QrCode || !html5QrCode.isScanning) return

  try {
    const caps = html5QrCode.getRunningTrackCameraCapabilities?.()
    
    // Zoom matériel
    if (caps && caps.zoomFeature) {
      zoomFeature = caps.zoomFeature()
      if (zoomFeature && zoomFeature.isSupported()) {
        hasZoom.value = true
        zoomMin.value = zoomFeature.min() || 1
        zoomMax.value = zoomFeature.max() || 1
        zoomStep.value = zoomFeature.step() || 0.1
        currentZoom.value = zoomFeature.value() || 1

        // Calcul des paliers rapides disponibles
        const presets = [1]
        if (zoomMax.value >= 2) presets.push(2)
        if (zoomMax.value >= 3) presets.push(3)
        if (zoomMax.value >= 4) presets.push(4)
        zoomPresets.value = presets

        // SOLUTION CLÉ : Par défaut, appliquer le zoom 2x (ou le max disponible si < 2x)
        // Les objectifs grand-angle modernes floutent à moins de 15 cm.
        // Avec un zoom 2x, l'utilisateur se tient à 25-30 cm : mise au point ultra-nette !
        const targetZoom = Math.min(2.0, zoomMax.value)
        if (targetZoom > zoomMin.value) {
          try {
            await zoomFeature.apply(targetZoom)
            currentZoom.value = targetZoom
          } catch (e) {
            console.warn("Impossible d'appliquer le zoom 2x par défaut:", e)
          }
        }
      } else {
        hasZoom.value = false
      }
    }

    // Lampe torche / Flash
    if (caps && caps.torchFeature) {
      torchFeature = caps.torchFeature()
      if (torchFeature && torchFeature.isSupported()) {
        hasTorch.value = true
        isTorchOn.value = torchFeature.value() || false
      } else {
        hasTorch.value = false
      }
    }
  } catch (err) {
    console.warn("Erreur détection des capacités caméra:", err)
  }
}

const applyZoom = async (val) => {
  if (!zoomFeature || !hasZoom.value) return
  try {
    const num = Math.min(Math.max(Number(val), zoomMin.value), zoomMax.value)
    await zoomFeature.apply(num)
    currentZoom.value = num
  } catch (err) {
    console.error("Erreur application du zoom:", err)
  }
}

const toggleTorch = async () => {
  if (!torchFeature || !hasTorch.value) return
  try {
    const nextState = !isTorchOn.value
    await torchFeature.apply(nextState)
    isTorchOn.value = nextState
  } catch (err) {
    console.error("Erreur bascule de la torche:", err)
  }
}

const switchCamera = async () => {
  if (availableCameras.value.length <= 1) return
  currentCameraIndex.value = (currentCameraIndex.value + 1) % availableCameras.value.length
  const nextCam = availableCameras.value[currentCameraIndex.value]
  currentCameraLabel.value = nextCam.label || `Caméra ${currentCameraIndex.value + 1}`

  if (html5QrCode && html5QrCode.isScanning) {
    await stopScanOnly()
    await startCameraWithConfig({ deviceId: { exact: nextCam.id } })
  }
}

const stopScanOnly = async () => {
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop()
      html5QrCode.clear()
    } catch (err) {
      console.error("Erreur arrêt scanner:", err)
    }
  }
  hasZoom.value = false
  hasTorch.value = false
  isTorchOn.value = false
}

const stopScan = async () => {
  await stopScanOnly()
  isScanning.value = false
  errorMessage.value = ''
}

const startCameraWithConfig = async (cameraConfig) => {
  const formats = [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.DATA_MATRIX
  ]

  html5QrCode = new Html5Qrcode(scannerDivId, {
    formatsToSupport: formats,
    useBarCodeDetectorIfSupported: true,
    verbose: false
  })

  // Configuration de numérisation optimisée pour codes-barres 1D et 2D
  const scanConfig = {
    fps: 15,
    // Zone rectangulaire panoramique adaptée aux étiquettes codes-barres
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const width = Math.floor(Math.min(viewfinderWidth * 0.88, 320))
      const height = Math.floor(Math.min(viewfinderHeight * 0.45, 150))
      return { width: Math.max(width, 220), height: Math.max(height, 90) }
    },
    // Contraintes haute résolution pour que les barres fines soient nettes
    videoConstraints: {
      ...cameraConfig,
      width: { min: 640, ideal: 1920 },
      height: { min: 480, ideal: 1080 },
      focusMode: { ideal: "continuous" }
    }
  }

  await html5QrCode.start(
    cameraConfig,
    scanConfig,
    (decodedText) => {
      playBeep()
      vibrateSuccess()
      emit('update:modelValue', decodedText)
      emit('scanned', decodedText)
      stopScan()
    },
    () => {
      // Ignorer les échecs continus normaux entre chaque frame
    }
  )

  // Une fois la caméra lancée, rafraîchir les capacités matérielles et la liste des caméras
  await updateCapabilities()

  try {
    const devices = await Html5Qrcode.getCameras()
    if (devices && devices.length > 0) {
      // Filtrer pour ne garder que les caméras arrières si possible
      const rearCameras = devices.filter(d => {
        const lbl = (d.label || '').toLowerCase()
        return !lbl.includes('front') && !lbl.includes('avant') && !lbl.includes('selfie')
      })
      availableCameras.value = rearCameras.length > 0 ? rearCameras : devices
      
      const settings = html5QrCode.getRunningTrackSettings?.()
      if (settings?.deviceId) {
        const foundIdx = availableCameras.value.findIndex(d => d.id === settings.deviceId)
        if (foundIdx !== -1) {
          currentCameraIndex.value = foundIdx
          currentCameraLabel.value = availableCameras.value[foundIdx].label || `Caméra ${foundIdx + 1}`
        }
      }
    }
  } catch (e) {
    console.warn("Échec récupération des caméras:", e)
  }
}

const startScan = async () => {
  errorMessage.value = ''
  isScanning.value = true
  await nextTick()

  try {
    // Si on a déjà identifié une caméra, l'utiliser, sinon "environment"
    const targetConfig = availableCameras.value.length > 0 && availableCameras.value[currentCameraIndex.value]
      ? { deviceId: { exact: availableCameras.value[currentCameraIndex.value].id } }
      : { facingMode: "environment" }

    await startCameraWithConfig(targetConfig)
  } catch (err) {
    console.error("Erreur lors du démarrage du scanner:", err)
    // Tentative de secours avec contrainte basique si la résolution haute a échoué
    try {
      await startCameraWithConfig({ facingMode: "environment" })
    } catch (fallbackErr) {
      console.error("Échec du secours scanner:", fallbackErr)
      errorMessage.value = "Impossible d'accéder à la caméra. Vérifiez les autorisations."
      await stopScan()
    }
  }
}

onBeforeUnmount(() => {
  stopScan()
})
</script>

<template>
  <div class="scanner-container">
    <div v-if="isScanning" class="scanner-wrapper">
      <!-- Barre d'outils caméra : Changement capteur + Lampe torche -->
      <div class="scanner-toolbar">
        <button 
          v-if="availableCameras.length > 1" 
          type="button" 
          class="tool-btn" 
          @click="switchCamera" 
          title="Changer d'objectif / caméra"
        >
          🔄 {{ currentCameraLabel ? currentCameraLabel.slice(0, 18) : 'Changer d\'objectif' }}
        </button>

        <button 
          v-if="hasTorch" 
          type="button" 
          class="tool-btn" 
          :class="{ active: isTorchOn }" 
          @click="toggleTorch" 
          title="Éclairer avec le flash"
        >
          {{ isTorchOn ? '🔦 Lampe ON' : '💡 Lampe OFF' }}
        </button>
      </div>

      <!-- Zone de visée vidéo -->
      <div id="reader" class="scanner-viewport"></div>

      <!-- Contrôles du Zoom matériel (Crucial contre le grand-angle) -->
      <div v-if="hasZoom" class="zoom-panel">
        <span class="zoom-label">🔍 Zoom :</span>
        <div class="zoom-presets">
          <button 
            v-for="preset in zoomPresets" 
            :key="preset" 
            type="button" 
            class="zoom-chip" 
            :class="{ active: Math.abs(currentZoom - preset) < 0.2 }"
            @click="applyZoom(preset)"
          >
            {{ preset }}x
          </button>
        </div>
        <input 
          type="range" 
          class="zoom-slider" 
          :min="zoomMin" 
          :max="zoomMax" 
          :step="zoomStep" 
          :value="currentZoom" 
          @input="applyZoom($event.target.value)" 
        />
        <span class="zoom-val">{{ currentZoom.toFixed(1) }}x</span>
      </div>

      <!-- Conseil d'utilisation anti-flou -->
      <div class="scanner-tip">
        <span>📐 <strong>Conseil netteté :</strong> tenez le téléphone à <strong>20-25 cm</strong> et utilisez le <strong>Zoom 2x</strong> pour éliminer l'effet grand-angle et obtenir un focus parfait.</span>
      </div>
    </div>

    <div v-if="errorMessage" class="scanner-error">
      {{ errorMessage }}
    </div>
    
    <button 
      type="button" 
      class="action-btn" 
      :class="isScanning ? 'danger' : 'primary'"
      style="width: 100%; margin-top: 1rem;" 
      @click="isScanning ? stopScan() : startScan()"
    >
      {{ isScanning ? '✖️ Arrêter le scan' : '📷 Scanner code-barres' }}
    </button>
  </div>
</template>

<style scoped>
.scanner-container {
  width: 100%;
}

.scanner-wrapper {
  position: relative;
  background: #0f172a;
  border-radius: var(--radius-md);
  padding: 0.5rem;
  box-shadow: var(--shadow-md);
  margin-bottom: 0.5rem;
}

.scanner-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tool-btn {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-md);
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.tool-btn.active {
  background: #f59e0b;
  color: #ffffff;
  border-color: #f59e0b;
}

.scanner-viewport {
  width: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000000;
}

.zoom-panel {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: #f8fafc;
}

.zoom-label {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.zoom-presets {
  display: flex;
  gap: 0.25rem;
}

.zoom-chip {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.zoom-chip.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #ffffff;
}

.zoom-slider {
  flex: 1;
  accent-color: var(--primary-color);
  cursor: pointer;
}

.zoom-val {
  font-size: 0.75rem;
  font-family: monospace;
  min-width: 2.2rem;
  text-align: right;
}

.scanner-tip {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(14, 165, 233, 0.15);
  border-left: 3px solid var(--primary-color);
  border-radius: 4px;
  color: #e0f2fe;
  font-size: 0.75rem;
  line-height: 1.35;
}

.scanner-error {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  text-align: center;
}

.danger {
  background-color: var(--danger);
  color: white;
  border-color: var(--danger);
}
.danger:hover {
  background-color: #dc2626;
}
</style>
