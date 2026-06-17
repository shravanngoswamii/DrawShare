<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useEditorStore } from "@/stores/editor";
import { PAPER_SIZES, type PaperSizeId, useProjectsStore } from "@/stores/projects";

// Shared "new project" dialog: pick the canvas type (and paper size for
// notebook) up front, since it's fixed for the project's life. Used by both the
// projects grid and the landing page so the create flow lives in one place.
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const projects = useProjectsStore();
const editor = useEditorStore();
const router = useRouter();

const paperSizes = PAPER_SIZES;
const createMode = ref<"free" | "notebook">("free");
const createSize = ref<PaperSizeId>("a4");

// Reset to defaults each time the dialog opens.
watch(
  () => props.open,
  (open) => {
    if (open) {
      createMode.value = "free";
      createSize.value = "a4";
    }
  },
);

function confirmCreate() {
  emit("close");
  const { project, page } = projects.create("Untitled", {
    mode: createMode.value,
    size: createSize.value,
  });
  editor.initNew(project, page);
  router.push({ name: "editor", params: { id: project.id } });
}
</script>

<template>
  <div v-if="open" class="create-backdrop" @click="emit('close')">
    <div class="create-dialog" role="dialog" aria-modal="true" aria-label="New project" @click.stop>
      <h2 class="create-title">New project</h2>
      <p class="create-sub muted">Pick how the canvas works. This can't be changed later.</p>
      <div class="mode-cards">
        <button
          class="mode-card"
          :class="{ active: createMode === 'free' }"
          :aria-pressed="createMode === 'free'"
          @click="createMode = 'free'"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3h18v18H3z" opacity="0" /><path d="M4 12h16M12 4v16" opacity="0" /><path d="M6 18c4-10 8 6 12-4" /><circle cx="4.5" cy="19.5" r="1.2" /><circle cx="19.5" cy="4.5" r="1.2" />
          </svg>
          <span class="mode-name">Free</span>
          <span class="mode-desc muted">Infinite canvas, draw anywhere</span>
        </button>
        <button
          class="mode-card"
          :class="{ active: createMode === 'notebook' }"
          :aria-pressed="createMode === 'notebook'"
          @click="createMode = 'notebook'"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 3v18" />
          </svg>
          <span class="mode-name">Notebook</span>
          <span class="mode-desc muted">Fixed-size pages</span>
        </button>
      </div>
      <div v-if="createMode === 'notebook'" class="size-block">
        <div class="size-label">Page size</div>
        <div class="size-row">
          <button
            v-for="sz in paperSizes"
            :key="sz.id"
            class="size-btn"
            :class="{ active: createSize === sz.id }"
            :aria-pressed="createSize === sz.id"
            @click="createSize = sz.id"
          >{{ sz.label }}</button>
        </div>
      </div>
      <div class="create-actions">
        <button class="btn" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" @click="confirmCreate">Create project</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.create-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.create-dialog {
  width: min(440px, 100%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-5);
}
.create-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.create-sub {
  margin: var(--space-1) 0 var(--space-4);
  font-size: var(--text-sm);
}
.mode-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: var(--space-4);
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  text-align: left;
  transition: border-color 80ms ease, background 80ms ease;
}
.mode-card:hover { border-color: var(--color-accent); }
.mode-card.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.mode-card svg { color: var(--color-text-muted); margin-bottom: var(--space-1); }
.mode-card.active svg { color: var(--color-accent); }
.mode-name { font-size: var(--text-sm); font-weight: 600; }
.mode-desc { font-size: var(--text-xs); line-height: 1.3; }
.size-block { margin-top: var(--space-4); }
.size-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.size-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.size-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: border-color 80ms ease, background 80ms ease, color 80ms ease;
}
.size-btn:hover { border-color: var(--color-accent); }
.size-btn.active {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-accent-text);
}
.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}
</style>
