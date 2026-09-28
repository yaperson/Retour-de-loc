<script setup>
import { ref, onBeforeUnmount, nextTick } from 'vue'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const props = defineProps({
  modelValue: String
})

const emit = defineEmits(['update:modelValue', 'scanned'])

const scannerDivId = 'reader'
const nativeInputRef = ref(null)

// États d'analyse photo
const isAnalyzing = ref(false)
const photoPreviewUrl = ref(null)
const lastDetectedCode = ref('')
const errorMessage = ref('')
const successMessage = ref('')

// Mode scan vidéo direct (optionnel)
const showLiveScanner = ref(false)
const isLiveScanning = ref(false)
let liveHtml5QrCode = null

// Formats de codes-barres ciblés
const supportedFormats = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX
]

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
    // non critique
  }
}

// Vibration tactile
const vibrateSuccess = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100])
    }
  } catch {
    // non critique
  }
}

// ==========================================
// 1. DÉCLENCHEMENT DE L'APPAREIL PHOTO NATIF
// ==========================================
const openNativeCamera = () => {
  errorMessage.value = ''
  successMessage.value = ''
  if (nativeInputRef.value) {
    nativeInputRef.value.click()
  }
}

// Prétraitement / Recadrage intelligent en mémoire pour optimiser la détection
const createOptimizedCanvasBlob = async (file, options = {}) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const { cropCenter = false, maxDim = 1600, enhanceContrast = false } = options
        let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height

        if (cropCenter) {
          // Recadrer le centre (75% largeur, 55% hauteur) où se trouve généralement le code
          srcW = Math.floor(img.width * 0.75)
          srcH = Math.floor(img.height * 0.55)
          srcX = Math.floor((img.width - srcW) / 2)
          srcY = Math.floor((img.height - srcH) / 2)
        }

        // Redimensionner si la photo du smartphone est gigantesque (ex: 48 MPixels)
        let targetW = srcW
        let targetH = srcH
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW >= targetH) {
            targetH = Math.round((targetH / targetW) * maxDim)
            targetW = maxDim
          } else {
            targetW = Math.round((targetW / targetH) * maxDim)
            targetH = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')

        if (enhanceContrast) {
          ctx.filter = 'contrast(1.35) brightness(1.05)'
        }

        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH)

        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Erreur génération blob"))
        }, 'image/jpeg', 0.92)
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// Analyse multi-passe d'une image
const decodeBarcodeFromImage = async (file) => {
  // Passe 1 : BarcodeDetector natif du navigateur si supporté (accélération GPU/NPU)
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix']
      })
      const bitmap = await createImageBitmap(file)
      const results = await detector.detect(bitmap)
      if (results && results.length > 0 && results[0].rawValue) {
        return results[0].rawValue
      }
    } catch (e) {
      console.warn("BarcodeDetector passe 1 a échoué:", e)
    }
  }

  // Passe 2 : Html5Qrcode.scanFile sur l'image d'origine
  try {
    const qrEngine = new Html5Qrcode(scannerDivId, {
      formatsToSupport: supportedFormats,
      useBarCodeDetectorIfSupported: true,
      verbose: false
    })
    const res = await qrEngine.scanFile(file, false)
    qrEngine.clear()
    if (res) return res
  } catch (e) {
    console.warn("Html5Qrcode passe 2 a échoué:", e)
  }

  // Passe 3 : Recadrage central optimisé (indispensable si la photo a été prise à 20-30 cm)
  try {
    const croppedBlob = await createOptimizedCanvasBlob(file, { cropCenter: true, maxDim: 1600 })
    if (croppedBlob) {
      const croppedFile = new File([croppedBlob], "cropped.jpg", { type: "image/jpeg" })

      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector()
          const bmp = await createImageBitmap(croppedFile)
          const results = await detector.detect(bmp)
          if (results && results.length > 0 && results[0].rawValue) {
            return results[0].rawValue
          }
        } catch {}
      }

      const qrEngine = new Html5Qrcode(scannerDivId, {
        formatsToSupport: supportedFormats,
        useBarCodeDetectorIfSupported: true,
        verbose: false
      })
      const res = await qrEngine.scanFile(croppedFile, false)
      qrEngine.clear()
      if (res) return res
    }
  } catch (e) {
    console.warn("Passe 3 (recadrage) a échoué:", e)
  }

  // Passe 4 : Contraste renforcé (au cas où l'éclairage était sombre)
  try {
    const contrastBlob = await createOptimizedCanvasBlob(file, { cropCenter: true, maxDim: 1600, enhanceContrast: true })
    if (contrastBlob) {
      const contrastFile = new File([contrastBlob], "contrast.jpg", { type: "image/jpeg" })
      const qrEngine = new Html5Qrcode(scannerDivId, {
        formatsToSupport: supportedFormats,
        useBarCodeDetectorIfSupported: true,
        verbose: false
      })
      const res = await qrEngine.scanFile(contrastFile, false)
      qrEngine.clear()
      if (res) return res
    }
  } catch (e) {
    console.warn("Passe 4 (contraste) a échoué:", e)
  }

  throw new Error("Aucun code-barres lisible trouvé sur cette photo.")
}

// Réception de la photo prise par l'appareil photo du téléphone
const onPhotoCaptured = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  isAnalyzing.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    if (photoPreviewUrl.value) {
      URL.revokeObjectURL(photoPreviewUrl.value)
    }
    photoPreviewUrl.value = URL.createObjectURL(file)

    const code = await decodeBarcodeFromImage(file)
    if (code) {
      playBeep()
      vibrateSuccess()
      lastDetectedCode.value = code
      successMessage.value = `Code détecté : ${code}`
      emit('update:modelValue', code)
      emit('scanned', code)
    }
  } catch (err) {
    console.warn("Erreur analyse photo:", err)
    errorMessage.value = "Aucun code-barres détecté sur la photo. Prenez la photo d'un peu plus près ou avec le zoom (2x), en tapotant sur l'écran pour que les barres soient bien nettes."
  } finally {
    isAnalyzing.value = false
    if (event.target) event.target.value = ''
  }
}

// ==========================================
// 2. SCAN VIDÉO EN DIRECT (ALTERNATIVE)
// ==========================================
const toggleLiveScan = async () => {
  if (isLiveScanning.value) {
    await stopLiveScan()
  } else {
    showLiveScanner.value = true
    await startLiveScan()
  }
}

const startLiveScan = async () => {
  isLiveScanning.value = true
  errorMessage.value = ''
  successMessage.value = ''
  await nextTick()

  liveHtml5QrCode = new Html5Qrcode(scannerDivId, {
    formatsToSupport: supportedFormats,
    useBarCodeDetectorIfSupported: true,
    verbose: false
  })

  try {
    await liveHtml5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => ({
          width: Math.floor(Math.min(viewfinderWidth * 0.88, 320)),
          height: Math.floor(Math.min(viewfinderHeight * 0.45, 140))
        }),
        videoConstraints: {
          facingMode: "environment",
          width: { min: 640, ideal: 1920 },
          height: { min: 480, ideal: 1080 }
        }
      },
      (decodedText) => {
        playBeep()
        vibrateSuccess()
        lastDetectedCode.value = decodedText
        successMessage.value = `Code détecté : ${decodedText}`
        emit('update:modelValue', decodedText)
        emit('scanned', decodedText)
        stopLiveScan()
      },
      () => {}
    )
  } catch (err) {
    console.error("Erreur scanner direct:", err)
    errorMessage.value = "Impossible d'accéder au flux vidéo en direct. Utilisez plutôt le bouton photo."
    await stopLiveScan()
  }
}

const stopLiveScan = async () => {
  if (liveHtml5QrCode && liveHtml5QrCode.isScanning) {
    try {
      await liveHtml5QrCode.stop()
      liveHtml5QrCode.clear()
    } catch (err) {
      console.error(err)
    }
  }
  isLiveScanning.value = false
  showLiveScanner.value = false
}

onBeforeUnmount(() => {
  if (photoPreviewUrl.value) {
    URL.revokeObjectURL(photoPreviewUrl.value)
  }
  stopLiveScan()
})
</script>

<template>
  <div class="scanner-container">
    <!-- Input invisible déclenchant l'application appareil photo native du smartphone -->
    <input 
      ref="nativeInputRef"
      type="file" 
      accept="image/*" 
      capture="environment" 
      class="hidden-file-input"
      @change="onPhotoCaptured"
    />

    <!-- BOUTON PRINCIPAL : Prendre en photo avec l'app photo native -->
    <button 
      type="button" 
      class="native-photo-btn"
      :disabled="isAnalyzing"
      @click="openNativeCamera"
    >
      <span class="btn-icon">📷</span>
      <div class="btn-content">
        <span class="btn-title">Prendre en photo le code-barres</span>
        <span class="btn-sub">Ouvre l'appareil photo avec autofocus et zoom natifs</span>
      </div>
    </button>

    <!-- Indicateur d'analyse en cours -->
    <div v-if="isAnalyzing" class="status-card analyzing">
      <div class="spinner"></div>
      <div class="status-text">
        <strong>Analyse du code-barres en cours...</strong>
        <span>Reconnaissance haute résolution des barres</span>
      </div>
    </div>

    <!-- Message de succès -->
    <div v-if="successMessage && !isAnalyzing" class="status-card success">
      <span class="status-icon">✅</span>
      <div class="status-text">
        <strong>{{ successMessage }}</strong>
        <span>Numéro de série enregistré avec succès !</span>
      </div>
    </div>

    <!-- Message d'erreur avec bouton pour recommencer -->
    <div v-if="errorMessage && !isAnalyzing" class="status-card error">
      <span class="status-icon">⚠️</span>
      <div class="status-text">
        <strong>Code non détecté</strong>
        <span>{{ errorMessage }}</span>
        <button type="button" class="retry-btn" @click="openNativeCamera">
          🔄 Reprendre une photo
        </button>
      </div>
    </div>

    <!-- Aperçu de la photo prise (si disponible) -->
    <div v-if="photoPreviewUrl && !isLiveScanning" class="photo-preview-wrapper">
      <img :src="photoPreviewUrl" alt="Photo code-barres" class="photo-preview-img" />
    </div>

    <!-- DIV NÉCESSAIRE POUR Html5Qrcode (invisible ou visible selon mode) -->
    <div 
      :id="scannerDivId" 
      class="scanner-viewport"
      :style="{ display: showLiveScanner && isLiveScanning ? 'block' : 'none' }"
    ></div>

    <!-- OPTION SECONDAIRE : SCAN VIDÉO EN DIRECT -->
    <div class="secondary-option">
      <button 
        type="button" 
        class="text-link-btn"
        @click="toggleLiveScan"
      >
        {{ isLiveScanning ? '✖️ Fermer le scanner vidéo en direct' : '📹 Ou utiliser le scanner vidéo en direct' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.scanner-container {
  width: 100%;
  margin-bottom: 0.5rem;
}

.hidden-file-input {
  display: none;
}

/* Bouton principal moderne et attractif */
.native-photo-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1.1rem;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  border: 1px solid #0284c7;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  text-align: left;
}

.native-photo-btn:hover {
  background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15);
}

.native-photo-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.btn-icon {
  font-size: 1.75rem;
  line-height: 1;
  flex-shrink: 0;
}

.btn-content {
  display: flex;
  flex-direction: column;
}

.btn-title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
}

.btn-sub {
  font-size: 0.75rem;
  color: #e0f2fe;
  margin-top: 0.15rem;
}

/* Cartes de statut (analyse, succès, erreur) */
.status-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md, 8px);
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.status-card.analyzing {
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  color: #0369a1;
}

.status-card.success {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.status-card.error {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.status-icon {
  font-size: 1.3rem;
  line-height: 1;
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
}

.retry-btn {
  margin-top: 0.4rem;
  align-self: flex-start;
  background: #ef4444;
  color: white;
  border: none;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.retry-btn:hover {
  background: #dc2626;
}

/* Spinner d'analyse */
.spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2.5px solid #bae6fd;
  border-top-color: #0284c7;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
  margin-top: 0.15rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Aperçu miniature de la photo */
.photo-preview-wrapper {
  margin-top: 0.75rem;
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  max-height: 140px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
}

.photo-preview-img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  opacity: 0.85;
}

/* Conteneur vidéo pour le scan continu */
.scanner-viewport {
  width: 100%;
  margin-top: 0.75rem;
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: #000000;
}

:deep(video) {
  width: 100% !important;
  height: auto !important;
  display: block;
}

/* Lien discret pour le mode continu */
.secondary-option {
  text-align: center;
  margin-top: 0.6rem;
}

.text-link-btn {
  background: none;
  border: none;
  color: var(--text-muted, #64748b);
  font-size: 0.8rem;
  text-decoration: underline;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
}

.text-link-btn:hover {
  color: var(--primary-color, #0ea5e9);
}
</style>
