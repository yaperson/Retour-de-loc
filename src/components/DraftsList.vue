<script setup>
import { onMounted } from 'vue'
import { useFormStore } from '../stores/form'

const store = useFormStore()

const emit = defineEmits(['load-draft'])

onMounted(async () => {
  await store.fetchDraftsList()
})

const formatDate = (isoString) => {
  if (!isoString) return ''
  const dt = new Date(isoString)
  return dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const selectDraft = async (id) => {
  await store.loadDraft(id)
  emit('load-draft')
}

const deleteDraft = async (id) => {
  if (confirm("Voulez-vous vraiment supprimer ce rapport ?")) {
    await store.deleteDraft(id)
  }
}
</script>

<template>
  <div class="drafts-container">
    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;">Rapports en cours ({{ store.draftsList.length }})</h2>
    
    <div v-if="store.draftsList.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted); background: white; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
      Aucun brouillon sauvegardé.
    </div>

    <div v-else class="draft-list">
      <div v-for="draft in store.draftsList" :key="draft.id" class="draft-card">
        <div class="draft-info" @click="selectDraft(draft.id)">
          <h3>{{ draft.title || 'Rapport sans titre' }}</h3>
          <p>Dernière modif : {{ formatDate(draft.updatedAt) }}</p>
          <p>Mode : <span class="badge">{{ draft.mode }}</span></p>
        </div>
        <button class="delete-btn" @click.stop="deleteDraft(draft.id)" title="Supprimer ce brouillon">🗑️</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drafts-container {
  margin-top: 1rem;
}
.draft-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.draft-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.draft-card:active {
  transform: scale(0.98);
}
.draft-info h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--primary-color);
}
.draft-info p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.badge {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  text-transform: uppercase;
}
.delete-btn {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  color: var(--danger);
  box-shadow: none;
}
.delete-btn:hover {
  background: #fee2e2;
}
</style>
