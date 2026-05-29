<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import CanvasStage from "@/components/CanvasStage.vue";
import DebugConsole from "@/components/DebugConsole.vue";
import PagesPanel from "@/components/PagesPanel.vue";
import Toolbar from "@/components/Toolbar.vue";
import TopBar from "@/components/TopBar.vue";
import { installPointerProbe } from "@/adapters/input/pointerDebug";
import { devMode } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ id: string }>();
const editor = useEditorStore();
const live = useLiveStore();
const projects = useProjectsStore();
const router = useRouter();

const panelOpen = ref(false);
const toolbarCollapsed = ref(false);
const pagesCollapsed = ref(false);

onMounted(async () => {
  if (!projects.loaded) await projects.load();
  try {
    await editor.open(props.id);
  } catch {
    router.replace({ name: "projects" });
  }
});

watch(
  () => props.id,
  async (next, prev) => {
    if (next !== prev) {
      live.stop();
      try {
        await editor.open(next);
      } catch {
        router.replace({ name: "projects" });
      }
    }
  },
);

onBeforeUnmount(() => {
  live.stop();
  window.removeEventListener("keydown", onKey);
});

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    editor.undo();
  } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
    e.preventDefault();
    editor.redo();
  } else if (e.key === "1") editor.setTool("pen");
  else if (e.key === "2") editor.setTool("highlighter");
  else if (e.key === "3") editor.setTool("eraser");
  else if (e.key === "Escape") { panelOpen.value = false; }
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
});

let removeProbe: (() => void) | undefined;
watch(
  devMode,
  (on) => {
    if (on && !removeProbe) removeProbe = installPointerProbe();
    else if (!on && removeProbe) {
      removeProbe();
      removeProbe = undefined;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => removeProbe?.());
</script>

<template>
  <div class="editor">
    <TopBar @toggle-pages="panelOpen = !panelOpen" />
    <div class="body">
      <Toolbar :collapsed="toolbarCollapsed" @toggle="toolbarCollapsed = !toolbarCollapsed" />
      <main class="stage-wrap">
        <CanvasStage v-if="editor.currentPage" :page="editor.currentPage" />
        <div v-else class="loading muted">Loading.</div>
      </main>
      <PagesPanel :open="panelOpen" :collapsed="pagesCollapsed" @close="panelOpen = false" @toggle="pagesCollapsed = !pagesCollapsed" />
      <!-- Sidebar re-open pills -->
      <button v-if="toolbarCollapsed" class="sidebar-pill pill-left" :class="{ quiet: editor.isDrawing }" @click="toolbarCollapsed = false" title="Show toolbar">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" fill-rule="evenodd" d="M10 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8zM9 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3zM4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" clip-rule="evenodd"/>
        </svg>
        <span>Tools</span>
      </button>
      <button v-if="pagesCollapsed" class="sidebar-pill pill-right" :class="{ quiet: editor.isDrawing }" @click="pagesCollapsed = false" title="Show pages">
        <span>{{ editor.currentPage?.name ?? 'Pages' }}</span>
        <span class="pill-badge">{{ editor.pages.length }}</span>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" fill-rule="evenodd" d="M10 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8zM9 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3zM4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
    <DebugConsole v-if="devMode" />
  </div>
</template>

<style scoped>
.editor {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: var(--safe-top);
}

.body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.stage-wrap {
  position: absolute;
  inset: 0;
  background: var(--color-bg);
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-pill {
  position: absolute;
  top: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: box-shadow 150ms, color 80ms, background 80ms, opacity 150ms;
}

.sidebar-pill:hover {
  box-shadow: var(--shadow-md);
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.98);
}

.pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-surface-2);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.sidebar-pill.quiet {
  opacity: 0.06;
  pointer-events: none;
}

.pill-left { left: 8px; }
.pill-right { right: 8px; }

@media (max-width: 767px) {
  .sidebar-pill { display: none; }
}

@media (max-width: 767px) {
  .body {
    display: flex;
    flex-direction: column-reverse;
  }

  .stage-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    inset: auto;
  }
}
</style>
