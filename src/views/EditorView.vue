<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { installPointerProbe } from "@/adapters/input/pointerDebug";
import CanvasStage from "@/components/CanvasStage.vue";
import DebugConsole from "@/components/DebugConsole.vue";
import HelpPanel from "@/components/HelpPanel.vue";
import PagesPanel from "@/components/PagesPanel.vue";
import ShareSessionModal from "@/components/ShareSessionModal.vue";
import Toolbar from "@/components/Toolbar.vue";
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
const shareOpen = ref(false);
const helpOpen = ref(false);

// Editor open/close animation. Closing plays the reverse (collapse-to-center)
// before any navigation away from the editor — back button, browser back, or
// programmatic. Skipped under reduced-motion.
const closing = ref(false);
const CLOSE_MS = 360;
const reduceMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

onBeforeRouteLeave(async () => {
  if (reduceMotion || closing.value) return;
  closing.value = true;
  await new Promise((resolve) => setTimeout(resolve, CLOSE_MS));
});

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
  else if (e.key === "Escape") {
    panelOpen.value = false;
    helpOpen.value = false;
  }
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
  <div class="editor" :class="{ closing }">
    <div class="body">
      <button class="hub-btn" :class="{ quiet: editor.isDrawing }" @click="panelOpen = !panelOpen" title="Menu" aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <Toolbar :collapsed="toolbarCollapsed" @toggle="toolbarCollapsed = !toolbarCollapsed" />
      <main class="stage-wrap" @pointerdown="if (helpOpen) helpOpen = false">
        <CanvasStage v-if="editor.currentPage" :page="editor.currentPage" />
        <div v-else class="loading muted">Loading.</div>
      </main>
      <PagesPanel :open="panelOpen" :collapsed="pagesCollapsed" @close="panelOpen = false" @toggle="pagesCollapsed = !pagesCollapsed" @share="shareOpen = true" />
      <!-- Sidebar re-open pills -->
      <button v-if="toolbarCollapsed" class="pencil-fab" :class="{ quiet: editor.isDrawing }" @click="toolbarCollapsed = false" title="Show tools" aria-label="Show tools">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
      <button v-if="pagesCollapsed" class="sidebar-pill pill-right" :class="{ quiet: editor.isDrawing }" @click="pagesCollapsed = false" title="Show pages">
        <span>{{ editor.currentPage?.name ?? 'Pages' }}</span>
        <span class="pill-badge">{{ editor.pages.length }}</span>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" fill-rule="evenodd" d="M10 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8zM9 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3zM4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" clip-rule="evenodd"/>
        </svg>
      </button>
      <button
        class="help-fab"
        :class="{ quiet: editor.isDrawing, active: helpOpen }"
        @click="helpOpen = !helpOpen"
        title="Help"
        aria-label="Help"
        :aria-expanded="helpOpen"
      >?</button>
    </div>
    <HelpPanel :open="helpOpen" @close="helpOpen = false" />
    <ShareSessionModal :open="shareOpen" @close="shareOpen = false" />
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
  /* Open feel: the editor expands outward from a centered rectangle toward all
     four edges (clip-path inset) with a gentle scale + fade. Runs once on mount,
     i.e. each time a project is opened from the projects list. */
  animation: editor-open 560ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center;
}

/* Closing: reverse of the open — collapse back toward the centre. Slightly
   quicker and ease-in so it accelerates inward. `forwards` holds the collapsed
   state until the (delayed) navigation completes. */
.editor.closing {
  animation: editor-close 360ms cubic-bezier(0.6, 0, 0.78, 0) forwards;
}

@keyframes editor-open {
  from {
    clip-path: inset(12% 12% 12% 12% round 22px);
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    clip-path: inset(0 0 0 0 round 0);
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes editor-close {
  from {
    clip-path: inset(0 0 0 0 round 0);
    transform: scale(1);
    opacity: 1;
  }
  to {
    clip-path: inset(12% 12% 12% 12% round 22px);
    transform: scale(0.95);
    opacity: 0;
  }
}

/* Respect users who prefer less motion (also tracked under the a11y pass). */
@media (prefers-reduced-motion: reduce) {
  .editor,
  .editor.closing {
    animation: none;
  }
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
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
  box-shadow: 0 2px 8px var(--color-glass-shadow), 0 1px 2px var(--color-glass-shadow);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: box-shadow 150ms, color 80ms, background 80ms, opacity 150ms;
}

.sidebar-pill:hover {
  box-shadow: var(--shadow-md);
  color: var(--color-text);
  background: var(--color-glass-bg-strong);
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

.pill-right { right: 8px; }

.pencil-fab {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
  box-shadow: 0 4px 14px var(--color-glass-shadow), 0 1px 2px var(--color-glass-shadow);
  color: var(--color-accent);
  transition: transform 100ms ease, box-shadow 150ms ease, opacity 150ms ease;
}

.pencil-fab:hover { transform: scale(1.05); box-shadow: var(--shadow-md); }
.pencil-fab:active { transform: scale(0.96); }

.pencil-fab.quiet {
  opacity: 0.06;
  pointer-events: none;
}

.help-fab {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 20;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
  box-shadow: 0 2px 8px var(--color-glass-shadow);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 150ms, color 80ms, background 80ms, opacity 150ms;
}
.help-fab:hover { box-shadow: var(--shadow-md); color: var(--color-text); }
.help-fab.active { background: var(--color-accent-soft); color: var(--color-accent); border-color: var(--color-accent); }
.help-fab.quiet { opacity: 0.06; pointer-events: none; }

.hub-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--color-glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
  box-shadow: 0 2px 8px var(--color-glass-shadow), 0 1px 2px var(--color-glass-shadow);
  color: var(--color-text-muted);
  transition: opacity 150ms ease;
}

.hub-btn.quiet {
  opacity: 0.06;
  pointer-events: none;
}

@media (max-width: 767px) {
  .sidebar-pill { display: none; }
  .hub-btn { display: flex; }
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
