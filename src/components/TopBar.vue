<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ShareSessionModal from "@/components/ShareSessionModal.vue";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";

defineEmits<{ "toggle-pages": [] }>();

const editor = useEditorStore();
const live = useLiveStore();
const projects = useProjectsStore();
const router = useRouter();

const name = ref("");
const shareOpen = ref(false);

watch(
  () => editor.project?.name,
  (n) => {
    name.value = n ?? "";
  },
  { immediate: true },
);

const saveStatus = computed(() => {
  if (editor.saving > 0) return "Saving.";
  return "Saved";
});

async function commitName() {
  if (!editor.project) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    name.value = editor.project.name;
    return;
  }
  if (trimmed !== editor.project.name) {
    editor.project.name = trimmed;
    await projects.rename(editor.project.id, trimmed);
  }
}

async function clearPage() {
  if (!confirm("Clear all strokes on this page?")) return;
  await editor.clearPage();
}
</script>

<template>
  <header class="topbar">
    <div class="left">
      <button
        class="btn btn-ghost btn-icon back-btn"
        @click="router.push({ name: 'projects' })"
        title="Back to projects"
        aria-label="Back to projects"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>
      <input
        v-model="name"
        class="project-name"
        @blur="commitName"
        @keydown.enter="commitName"
        :placeholder="editor.project?.name ?? 'Untitled'"
      />
    </div>
    <div class="right">
      <span class="muted save">{{ saveStatus }}</span>
      <button class="btn btn-ghost clear-btn" @click="clearPage" title="Clear page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        </svg>
        <span class="btn-label">Clear page</span>
      </button>
      <button
        class="btn share-btn"
        :class="{ 'btn-live': live.isHosting }"
        @click="shareOpen = true"
        :title="live.isHosting ? 'Hosting live session ' + live.code : 'Share live session'"
      >
        <span v-if="live.isHosting" class="live-dot" aria-hidden="true"></span>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
        <span class="btn-label">{{ live.isHosting ? `Live  ${live.code}` : "Share" }}</span>
      </button>
      <button
        class="btn btn-ghost btn-icon pages-btn"
        @click="$emit('toggle-pages')"
        title="Pages"
        aria-label="Pages"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </button>
    </div>
    <ShareSessionModal :open="shareOpen" @close="shareOpen = false" />
  </header>
</template>

<style scoped>
.topbar {
  height: var(--header-h);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-3);
  gap: var(--space-2);
  flex-shrink: 0;
}

.left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
}

.right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.project-name {
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  padding: 6px var(--space-2);
  border-radius: var(--radius-md);
  width: 100%;
  max-width: 320px;
  min-width: 0;
}

.project-name:hover {
  background: var(--color-surface-2);
}

.project-name:focus {
  outline: none;
  background: var(--color-surface);
  border-color: var(--color-focus);
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}

.save {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.btn-live {
  background: var(--color-success-soft);
  border-color: var(--color-success-border);
  color: var(--color-success-strong);
}

.btn-live:hover:not(:disabled) {
  background: #d1fae5;
  border-color: var(--color-success);
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
}

.pages-btn {
  display: none;
}

@media (max-width: 1023px) {
  .pages-btn {
    display: inline-flex;
  }
}

@media (max-width: 767px) {
  .topbar {
    padding: 0 var(--space-2);
  }

  .save {
    display: none;
  }

  .btn-label {
    display: none;
  }

  .clear-btn,
  .share-btn {
    width: 40px;
    padding: 0;
  }

  .share-btn.btn-live {
    width: auto;
    padding: 0 var(--space-3);
  }

  .share-btn.btn-live .btn-label {
    display: inline;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: 0.06em;
  }

  .project-name {
    font-size: var(--text-sm);
    padding: 4px var(--space-2);
  }
}
</style>
