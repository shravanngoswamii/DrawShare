<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ShareSessionModal from "@/components/ShareSessionModal.vue";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";

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
        class="btn btn-ghost"
        @click="router.push({ name: 'projects' })"
        title="Back to projects"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Projects
      </button>
      <div class="divider"></div>
      <input
        v-model="name"
        class="project-name"
        @blur="commitName"
        @keydown.enter="commitName"
        :placeholder="editor.project?.name ?? ''"
      />
    </div>
    <div class="right">
      <span class="muted save">{{ saveStatus }}</span>
      <button class="btn btn-ghost" @click="clearPage">Clear page</button>
      <button
        class="btn"
        :class="{ 'btn-live': live.isHosting }"
        @click="shareOpen = true"
      >
        <span v-if="live.isHosting" class="live-dot"></span>
        {{ live.isHosting ? `Live - ${live.code}` : "Share live" }}
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
  padding: 0 var(--space-4);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
}

.project-name {
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  padding: 6px var(--space-2);
  border-radius: var(--radius-md);
  width: 280px;
}

.project-name:hover {
  background: var(--color-surface-2);
}

.project-name:focus {
  outline: none;
  background: var(--color-surface);
  border-color: var(--color-focus);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.save {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.btn-live {
  background: #ecfdf5;
  border-color: #86efac;
  color: #166534;
}

.btn-live:hover {
  background: #d1fae5;
  border-color: #4ade80;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18);
}
</style>
