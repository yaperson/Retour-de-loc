<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Html5Qrcode } from 'html5-qrcode'

const props = defineProps({
  modelValue: String
})

const emit = defineEmits(['update:modelValue', 'scanned'])

const scannerDivId = 'reader'
const isScanning = ref(false)
let html5QrCode = null

const startScan = async () => {
  isScanning.value = true
  await nextTick()
  html5QrCode = new Html5Qrcode(scannerDivId)
  
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 150 }
      },
      (decodedText) => {
        emit('update:modelValue', decodedText)
        emit('scanned', decodedText)
        stopScan()
      },
      (errorMessage) => {
        // Ignorer les erreurs de lecture continues
      }
    )
  } catch (err) {
    console.error("Erreur lors du démarrage du scanner:", err)
    alert("Impossible d'accéder à la caméra.")
    stopScan()
  }
}

const stopScan = async () => {
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop()
    } catch (err) {
      console.error(err)
    }
  }
  isScanning.value = false
}

onBeforeUnmount(() => {
  stopScan()
})
</script>

<template>
  <div class="scanner-container">
    <div v-if="isScanning" id="reader" style="width: 100%; border-radius: var(--radius-md); overflow: hidden;"></div>
    
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
.danger {
  background-color: var(--danger);
  color: white;
  border-color: var(--danger);
}
.danger:hover {
  background-color: #dc2626;
}
</style>
