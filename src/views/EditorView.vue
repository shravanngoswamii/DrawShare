<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { installPointerProbe } from "@/adapters/input/pointerDebug";
import { storage } from "@/adapters/storage/indexedDB";
// biome-ignore lint/style/useImportType: rendered in the template — needs a value import, not `import type` (would break runtime component resolution).
import CanvasStage from "@/components/CanvasStage.vue";
import DebugConsole from "@/components/DebugConsole.vue";
import HelpPanel from "@/components/HelpPanel.vue";
import PagesPanel from "@/components/PagesPanel.vue";
import ReplayControls from "@/components/ReplayControls.vue";
import ShareSessionModal from "@/components/ShareSessionModal.vue";
import Toolbar from "@/components/Toolbar.vue";
import { useOnboarding } from "@/composables/useOnboarding";
import { devMode } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";
import { useReplayStore } from "@/stores/replay";

const canvasStage = ref<InstanceType<typeof CanvasStage> | null>(null);

const props = defineProps<{ id: string }>();
const editor = useEditorStore();
const live = useLiveStore();
const projects = useProjectsStore();
const replay = useReplayStore();
const router = useRouter();
const { maybeStart } = useOnboarding();

// Replay is offered whenever the project has anything to replay (any content type).
const hasContent = computed(
  () =>
    editor.strokes.length > 0 ||
    editor.shapes.length > 0 ||
    editor.images.length > 0 ||
    editor.pages.some((p) => (p.texts?.length ?? 0) > 0),
);

// Prefer exact-history playback when a recorded event log exists; otherwise fall
// back to reconstructing the drawing from its final content.
async function startReplay() {
  if (!editor.project) return;
  const events = await storage.listEvents(editor.project.id);
  if (events.length > 0) {
    replay.startEvents(events);
  } else {
    replay.start({
      strokes: editor.strokes,
      shapes: editor.shapes,
      images: editor.images,
      pages: editor.pages,
    });
  }
}

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
    // First-board feature tour, once the open animation has settled so intro.js
    // measures the tools/panel at their final positions.
    maybeStart("editor", 700);
  } catch {
    router.replace({ name: "app" });
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
        router.replace({ name: "app" });
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
    <a href="#canvas-main" class="skip-link">Skip to canvas</a>
    <div class="body">
      <button class="hub-btn" :class="{ quiet: editor.isDrawing }" @click="panelOpen = !panelOpen" title="Menu" aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <Toolbar :collapsed="toolbarCollapsed" :panel-open="!pagesCollapsed" @toggle="toolbarCollapsed = !toolbarCollapsed" @image-import="canvasStage?.triggerFileImport()" />
      <main id="canvas-main" class="stage-wrap" aria-label="Drawing canvas" @pointerdown="helpOpen = false">
        <CanvasStage v-if="editor.currentPage" ref="canvasStage" :page="editor.currentPage" />
        <div v-else class="loading muted" aria-live="polite">Loading.</div>
      </main>
      <PagesPanel :open="panelOpen" :collapsed="pagesCollapsed" @close="panelOpen = false" @toggle="pagesCollapsed = !pagesCollapsed" @share="shareOpen = true" />
      <!-- Back to projects (top-left) -->
      <button class="back-fab" :class="{ quiet: editor.isDrawing }" @click="router.push({ name: 'app' })" title="Back to projects" aria-label="Back to projects">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
        </svg>
      </button>
      <!-- Sidebar re-open pills -->
      <button v-if="toolbarCollapsed" class="pencil-fab" :class="{ quiet: editor.isDrawing }" @click="toolbarCollapsed = false" title="Show tools" aria-label="Show tools">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
      <!-- Replay FAB: shown when the page has any content and replay isn't active -->
      <button
        v-if="hasContent && !replay.active"
        class="replay-fab"
        :class="{ quiet: editor.isDrawing, shifted: !pagesCollapsed }"
        title="Replay how this page was drawn"
        aria-label="Replay how this page was drawn"
        @click="startReplay()"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
      <!-- Replay controls overlay (absolutely positioned inside .body) -->
      <ReplayControls v-if="replay.active" />
      <button
        class="help-fab"
        :class="{ quiet: editor.isDrawing, active: helpOpen, shifted: !pagesCollapsed }"
        @click="helpOpen = !helpOpen"
        title="Help"
        aria-label="Help"
        :aria-expanded="helpOpen"
      >?</button>
    </div>
  </div>
  <HelpPanel :open="helpOpen" @close="helpOpen = false" />
  <ShareSessionModal :open="shareOpen" @close="shareOpen = false" />
  <DebugConsole v-if="devMode" />
</template>

<style scoped>
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  z-index: 100;
  padding: 8px 16px;
  background: var(--color-accent);
  color: var(--color-accent-text);
  border-radius: 0 0 var(--radius-md) 0;
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus {
  top: 0;
}

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


.back-fab,
.pencil-fab {
  position: absolute;
  top: 12px;
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
  transition: transform 100ms ease, box-shadow 150ms ease, opacity 150ms ease;
}

.back-fab { left: 12px; color: var(--color-text); }
/* Sits to the right of Back so the two never overlap when the toolbar is hidden. */
.pencil-fab { left: 64px; color: var(--color-accent); }

.back-fab:hover,
.pencil-fab:hover { transform: scale(1.05); box-shadow: var(--shadow-md); }
.back-fab:active,
.pencil-fab:active { transform: scale(0.96); }

.back-fab.quiet,
.pencil-fab.quiet {
  opacity: 0.06;
  pointer-events: none;
}

.replay-fab {
  position: absolute;
  /* Bottom-right, stacked above the help button — clear of the canvas, the
     zoom controls (bottom-left) and the pages panel (top-right). */
  bottom: 60px;
  right: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-pill);
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
  box-shadow: 0 4px 14px var(--color-glass-shadow), 0 1px 2px var(--color-glass-shadow);
  color: var(--color-accent);
  transition: transform 100ms ease, box-shadow 150ms ease, opacity 150ms ease, right 200ms ease;
}

.replay-fab:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-md);
}

.replay-fab:active {
  transform: scale(0.96);
}

.replay-fab.quiet {
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
  transition: box-shadow 150ms, color 80ms, background 80ms, opacity 150ms, right 200ms ease;
}
.help-fab:hover { box-shadow: var(--shadow-md); color: var(--color-text); }
.help-fab.active { background: var(--color-accent-soft); color: var(--color-accent); border-color: var(--color-accent); }
.help-fab.quiet { opacity: 0.06; pointer-events: none; }

/* When the pages panel is open on desktop it owns the right edge, so slide the
   corner FABs left to sit just clear of it. (Mobile panel is a drawer — no shift.) */
@media (min-width: 768px) {
  .help-fab.shifted { right: calc(var(--sidepanel-w) + 20px); }
  .replay-fab.shifted { right: calc(var(--sidepanel-w) + 16px); }
}

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

  /* The toolbar is a floating pill at the bottom; lift the corner FABs above it. */
  .help-fab {
    bottom: calc(var(--safe-bottom, 0px) + 72px);
  }
  .replay-fab {
    bottom: calc(var(--safe-bottom, 0px) + 118px);
  }
  .help-fab.shifted,
  .replay-fab.shifted {
    right: 12px;
  }
}
</style>
