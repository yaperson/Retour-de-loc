<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: String
})

const emit = defineEmits(['update:modelValue'])

const canvas = ref(null)
const ctx = ref(null)
const isDrawing = ref(false)

onMounted(() => {
  if (canvas.value) {
    ctx.value = canvas.value.getContext('2d')
    ctx.value.lineWidth = 2
    ctx.value.lineCap = 'round'
    ctx.value.strokeStyle = '#000000'
  }
})

const getCoordinates = (e) => {
  if (e.touches && e.touches.length > 0) {
    const rect = canvas.value.getBoundingClientRect()
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    }
  }
  return {
    x: e.offsetX,
    y: e.offsetY
  }
}

const startDrawing = (e) => {
  e.preventDefault()
  isDrawing.value = true
  const { x, y } = getCoordinates(e)
  ctx.value.beginPath()
  ctx.value.moveTo(x, y)
}

const draw = (e) => {
  if (!isDrawing.value) return
  e.preventDefault()
  const { x, y } = getCoordinates(e)
  ctx.value.lineTo(x, y)
  ctx.value.stroke()
}

const stopDrawing = () => {
  if (isDrawing.value) {
    isDrawing.value = false
    emit('update:modelValue', canvas.value.toDataURL('image/png'))
  }
}

const clearSignature = () => {
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height)
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="signature-container">
    <canvas
      ref="canvas"
      width="300"
      height="150"
      @mousedown="startDrawing"
      @mousemove="draw"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
      @touchstart="startDrawing"
      @touchmove="draw"
      @touchend="stopDrawing"
    ></canvas>
    <button type="button" class="action-btn" @click="clearSignature" style="margin-top: 0.5rem; width: 100%;">
      Effacer la signature
    </button>
  </div>
</template>

<style scoped>
.signature-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}
canvas {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: #fff;
  touch-action: none; /* Empêche le scroll sur mobile quand on signe */
  width: 100%;
  max-width: 300px;
}
</style>
