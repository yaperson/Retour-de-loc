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

// ZOOM UNIVERSEL (Fonctionne sur 100% des téléphones : matériel si supporté, sinon numérique)
const isSoftwareZoom = ref(false)
const zoomMin = ref(1)
const zoomMax = ref(3.5)
const zoomStep = ref(0.1)
const currentZoom = ref(2.0) // 2x par défaut pour éliminer immédiatement l'effet grand-angle !
const zoomPresets = ref([1, 1.5, 2, 2.5, 3])

// Flash / Torche
const hasTorch = ref(false)
const isTorchOn = ref(false)

// Gestion multi-caméras (Objectif 0.5x, 1x, 3x, etc.)
const availableCameras = ref([])
const currentCameraIndex = ref(0)
const currentCameraLabel = ref('')

let html5QrCode = null
let zoomFeature = null
let torchFeature = null

// Gestion du pincement pour zoomer (Pinch-to-zoom)
let touchStartDist = 0
let touchStartZoom = 2.0

const onTouchStart = (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    touchStartDist = Math.hypot(dx, dy)
    touchStartZoom = currentZoom.value
  }
}

const onTouchMove = (e) => {
  if (e.touches.length === 2 && touchStartDist > 0) {
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.hypot(dx, dy)
    const factor = dist / touchStartDist
    const newZoom = Math.min(Math.max(touchStartZoom * factor, zoomMin.value), zoomMax.value)
    applyZoom(Math.round(newZoom * 10) / 10)
  }
}

const onTouchEnd = () => {
  touchStartDist = 0
}

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
    // audio non critique
  }
}

// Vibration tactile
const vibrateSuccess = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100])
    }
  } catch {
    // vibration non critique
  }
}

// Mise à jour visuelle pour le zoom logiciel (agrandissement de la balise vidéo)
const updateVisualZoom = () => {
  const video = document.querySelector(`#${scannerDivId} video`)
  if (!video) return

  if (isSoftwareZoom.value) {
    const z = currentZoom.value
    video.style.transform = z > 1 ? `scale(${z})` : 'none'
    video.style.transformOrigin = 'center center'
    video.style.transition = 'transform 0.12s ease-out'
  } else {
    video.style.transform = 'none'
  }
}

// Hook sur le canvas html5-qrcode pour décoder la zone zoomée même sans support matériel (ex: Safari iOS)
const hookCanvasForSoftwareZoom = () => {
  let ctx = null
  if (html5QrCode && html5QrCode.context) {
    ctx = html5QrCode.context
  } else {
    const canvas = document.querySelector(`#${scannerDivId} canvas`)
    if (canvas) ctx = canvas.getContext('2d')
  }

  if (!ctx || ctx.__zoomHooked) return

  const originalDrawImage = ctx.drawImage
  ctx.__zoomHooked = true

  ctx.drawImage = function (image, ...args) {
    // foreverScan appelle drawImage avec 8 arguments (source X, Y, W, H, dest X, Y, W, H)
    if (args.length === 8 && isSoftwareZoom.value && currentZoom.value > 1.01) {
      const z = currentZoom.value
      const sx = args[0]
      const sy = args[1]
      const sWidth = args[2]
      const sHeight = args[3]
      const dx = args[4]
      const dy = args[5]
      const dWidth = args[6]
      const dHeight = args[7]

      // Découper uniquement le centre correspondant au niveau de zoom
      const cx = sx + sWidth / 2
      const cy = sy + sHeight / 2
      const zw = sWidth / z
      const zh = sHeight / z
      const zsx = Math.max(0, cx - zw / 2)
      const zsy = Math.max(0, cy - zh / 2)

      return originalDrawImage.call(this, image, zsx, zsy, zw, zh, dx, dy, dWidth, dHeight)
    }

    return originalDrawImage.apply(this, [image, ...args])
  }
}

const applyZoom = async (val) => {
  const num = Math.min(Math.max(Number(val), zoomMin.value), zoomMax.value)
  currentZoom.value = Math.round(num * 10) / 10

  if (!isSoftwareZoom.value && zoomFeature) {
    try {
      await zoomFeature.apply(currentZoom.value)
    } catch (err) {
      console.warn("Échec application zoom matériel, bascule en zoom logiciel:", err)
      isSoftwareZoom.value = true
      updateVisualZoom()
    }
  } else {
    updateVisualZoom()
  }
}

const updateCapabilities = async () => {
  if (!html5QrCode || !html5QrCode.isScanning) return

  // Par défaut, activer le zoom logiciel haute résolution (garanti sur tous téléphones)
  isSoftwareZoom.value = true

  try {
    const caps = html5QrCode.getRunningTrackCameraCapabilities?.()
    
    // Vérifier si le zoom matériel natif est supporté par le navigateur (ex: Chrome Android)
    if (caps && caps.zoomFeature) {
      const zf = caps.zoomFeature()
      if (zf && zf.isSupported()) {
        zoomFeature = zf
        zoomMin.value = zf.min() || 1
        zoomMax.value = Math.max(zf.max() || 3, 3)
        zoomStep.value = zf.step() || 0.1
        isSoftwareZoom.value = false // Le matériel prend le relais
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
    isSoftwareZoom.value = true
  }

  // Intercepter le canvas pour le décodage zoomé
  hookCanvasForSoftwareZoom()

  // Appliquer le zoom 2x par défaut
  await applyZoom(2.0)
}

const toggleTorch = async () => {
  if (!torchFeature || !hasTorch.value) return
  try {
    const nextState = !isTorchOn.value
    await torchFeature.apply(nextState)
    isTorchOn.value = nextState
  } catch (err) {
    console.error("Erreur bascule torche:", err)
  }
}

const loadAvailableCameras = async () => {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter(d => d.kind === 'videoinput')

    if (videoDevices.length > 0) {
      const backCams = videoDevices.filter(d => {
        const lbl = (d.label || '').toLowerCase()
        return !lbl.includes('front') && !lbl.includes('avant') && !lbl.includes('selfie') && !lbl.includes('user')
      })

      const list = backCams.length > 0 ? backCams : videoDevices
      availableCameras.value = list.map((cam, idx) => {
        let label = cam.label || `Objectif ${idx + 1}`
        const lower = label.toLowerCase()
        if (lower.includes('ultra') || lower.includes('0.5')) {
          label = `Ultra Grand-Angle (0.5x)`
        } else if (lower.includes('tele') || lower.includes('zoom')) {
          label = `Téléobjectif`
        } else if (lower.includes('back') || lower.includes('rear') || lower.includes('arrière')) {
          label = `Capteur Principal (1x)`
        }
        return { id: cam.deviceId, label }
      })

      // Détecter la caméra actuellement active
      const runningTrack = html5QrCode?.getRunningTrackSettings?.()
      if (runningTrack?.deviceId) {
        const found = availableCameras.value.findIndex(c => c.id === runningTrack.deviceId)
        if (found !== -1) {
          currentCameraIndex.value = found
          currentCameraLabel.value = availableCameras.value[found].label
        }
      } else if (availableCameras.value.length > 0) {
        currentCameraLabel.value = availableCameras.value[currentCameraIndex.value]?.label || ''
      }
    }
  } catch (e) {
    console.warn("Erreur chargement caméras:", e)
  }
}

const switchCamera = async () => {
  if (availableCameras.value.length <= 1) return
  currentCameraIndex.value = (currentCameraIndex.value + 1) % availableCameras.value.length
  const nextCam = availableCameras.value[currentCameraIndex.value]
  currentCameraLabel.value = nextCam.label

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

  const scanConfig = {
    fps: 15,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const width = Math.floor(Math.min(viewfinderWidth * 0.88, 320))
      const height = Math.floor(Math.min(viewfinderHeight * 0.45, 150))
      return { width: Math.max(width, 220), height: Math.max(height, 90) }
    },
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
    () => {}
  )

  await updateCapabilities()
  await loadAvailableCameras()
}

const startScan = async () => {
  errorMessage.value = ''
  isScanning.value = true
  await nextTick()

  try {
    const targetConfig = availableCameras.value.length > 0 && availableCameras.value[currentCameraIndex.value]
      ? { deviceId: { exact: availableCameras.value[currentCameraIndex.value].id } }
      : { facingMode: "environment" }

    await startCameraWithConfig(targetConfig)
  } catch (err) {
    console.error("Erreur démarrage scanner:", err)
    try {
      await startCameraWithConfig({ facingMode: "environment" })
    } catch (fallbackErr) {
      console.error("Échec secours scanner:", fallbackErr)
      errorMessage.value = "Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur."
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
          title="Changer d'objectif"
        >
          🔄 {{ currentCameraLabel || 'Changer capteur' }}
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

      <!-- Zone de visée vidéo avec support du pincement pour zoomer -->
      <div 
        id="reader" 
        class="scanner-viewport"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      ></div>

      <!-- Panneau de Zoom Universel (Toujours affiché) -->
      <div class="zoom-panel">
        <div class="zoom-header">
          <span class="zoom-title">🔍 Zoom : <strong>{{ currentZoom.toFixed(1) }}x</strong></span>
          <span class="zoom-badge">{{ isSoftwareZoom ? 'HD Numérique' : 'Matériel' }}</span>
        </div>

        <div class="zoom-controls">
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
        </div>
      </div>

      <!-- Guide utilisateur anti-flou -->
      <div class="scanner-tip">
        <span>📐 <strong>Anti-flou :</strong> gardez le téléphone à <strong>20–25 cm</strong> du code. Le <strong>Zoom 2x</strong> compense l'objectif grand angle pour garder les barres parfaitement nettes.</span>
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
  padding: 0.6rem;
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
  position: relative;
  touch-action: none; /* Crucial pour le pinch-to-zoom sans scroll parasite */
}

:deep(video) {
  width: 100% !important;
  height: auto !important;
  display: block;
}

.zoom-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.6rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: #f8fafc;
}

.zoom-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.zoom-title {
  font-size: 0.85rem;
}

.zoom-badge {
  font-size: 0.65rem;
  background: rgba(14, 165, 233, 0.3);
  color: #38bdf8;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.zoom-presets {
  display: flex;
  gap: 0.25rem;
}

.zoom-chip {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 0.25rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.zoom-chip:hover {
  background: rgba(255, 255, 255, 0.25);
}

.zoom-chip.active {
  background: var(--primary-color, #0ea5e9);
  border-color: var(--primary-color, #0ea5e9);
  color: #ffffff;
}

.zoom-slider {
  flex: 1;
  accent-color: var(--primary-color, #0ea5e9);
  cursor: pointer;
  height: 6px;
}

.scanner-tip {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(14, 165, 233, 0.15);
  border-left: 3px solid var(--primary-color, #0ea5e9);
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
  background-color: var(--danger, #ef4444);
  color: white;
  border-color: var(--danger, #ef4444);
}
.danger:hover {
  background-color: #dc2626;
}
</style>
