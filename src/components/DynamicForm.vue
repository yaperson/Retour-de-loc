<script setup>
import { computed } from 'vue'
import { useFormStore } from '../stores/form'

const store = useFormStore()

const props = defineProps({
  mode: String
})

const savQuestions = computed(() => store.savQuestions || [])
const generalQuestions = computed(() => store.generalQuestions || [])
const etatElements = computed(() => store.etatElements?.[store.typeMateriel] || [])

const setGeneralAnswer = (index, value) => { store.generalAnswers[index] = value }
const setSavAnswer = (index, value) => { store.savAnswers[index] = value }
const setEtatAnswer = (index, value) => { store.etatAnswers[index] = value }

</script>

<template>
  <div class="dynamic-form" v-if="store.typeMateriel">
    
    <!-- SAV Mode : Questions à la réception -->
    <div v-if="mode === 'sav'">
      <h3 class="section-title">Questions à la réception du produit</h3>
      <div v-for="(q, i) in savQuestions" :key="'sav'+i" class="question-block">
        <p>{{ q }}</p>
        <div class="buttons-choices">
          <button type="button" @click="setSavAnswer(i, 'Oui')" :class="{ 'selected validate': store.savAnswers[i] === 'Oui' }">Oui</button>
          <button type="button" @click="setSavAnswer(i, 'Non')" :class="{ 'selected error': store.savAnswers[i] === 'Non' }">Non</button>
        </div>
      </div>
    </div>

    <!-- Etat des éléments -->
    <div v-if="etatElements.length > 0">
      <h3 class="section-title">État des éléments</h3>
      <div v-for="(el, i) in etatElements" :key="'etat'+i" class="question-block">
        <p>{{ el }}</p>
        <div class="buttons-choices">
          <button type="button" @click="setEtatAnswer(i, 'Bon (RAS)')" :class="{ 'selected validate': store.etatAnswers[i] === 'Bon (RAS)' }">Bon (RAS)</button>
          <button type="button" @click="setEtatAnswer(i, 'Moyen (Entretien)')" :class="{ 'selected warning': store.etatAnswers[i] === 'Moyen (Entretien)' }">Moyen (Entretien)</button>
          <button type="button" @click="setEtatAnswer(i, 'Mauvais (HS)')" :class="{ 'selected error': store.etatAnswers[i] === 'Mauvais (HS)' }">Mauvais (HS)</button>
        </div>
      </div>
    </div>

    <!-- Questions Générales (Post Entretien ou Standard) -->
    <div>
      <h3 class="section-title" v-if="mode === 'sav'">Questions générales post entretien</h3>
      <h3 class="section-title" v-else>Questions générales</h3>
      
      <div v-for="(q, i) in generalQuestions" :key="'gen'+i" class="question-block">
        <p>{{ q }}</p>
        <div class="buttons-choices">
          <button type="button" @click="setGeneralAnswer(i, 'Oui')" :class="{ 'selected validate': store.generalAnswers[i] === 'Oui' }">Oui</button>
          <button type="button" @click="setGeneralAnswer(i, 'Non')" :class="{ 'selected error': store.generalAnswers[i] === 'Non' }">Non</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 0.5rem;
}
.question-block {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}
.question-block p {
  font-weight: 500;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}
.buttons-choices {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.buttons-choices button {
  flex: 1;
  min-width: 80px;
}
.buttons-choices button.validate { background-color: var(--success); color: white; border-color: var(--success); }
.buttons-choices button.warning { background-color: var(--warning); color: white; border-color: var(--warning); }
.buttons-choices button.error { background-color: var(--danger); color: white; border-color: var(--danger); }
</style>
