<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { installPointerProbe } from "@/adapters/input/pointerDebug";
import { storage } from "@/adapters/storage/indexedDB";
// biome-ignore lint/style/useImportType: rendered in the template — needs a value import, not `import type` (would break runtime component resolution).
import CanvasStage from "@/components/CanvasStage.vue";
import ChatPanel from "@/components/ChatPanel.vue";
import DebugConsole from "@/components/DebugConsole.vue";
import HelpPanel from "@/components/HelpPanel.vue";
import PagesPanel from "@/components/PagesPanel.vue";
import ReplayControls from "@/components/ReplayControls.vue";
import ShareSessionModal from "@/components/ShareSessionModal.vue";
import Toolbar from "@/components/Toolbar.vue";
import { useLiveSnapshot } from "@/composables/useLiveSnapshot";
import { useOnboarding } from "@/composables/useOnboarding";
import { useTheme } from "@/composables/useTheme";
import { readFragmentParam } from "@/core/shareLinks";
import { devMode } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";
import { useReplayStore } from "@/stores/replay";

const canvasStage = ref<InstanceType<typeof CanvasStage> | null>(null);

// Two routes share this view: the host editor (/p/:id) and the live viewer
// (/v/:code). The viewer runs the exact same chrome in editor-store "guest"
// mode — host-only controls are locked, the rest is identical.
const props = defineProps<{ id?: string; code?: string }>();
const editor = useEditorStore();
const live = useLiveStore();
const projects = useProjectsStore();
const replay = useReplayStore();
const router = useRouter();
const route = useRoute();
const { maybeStart } = useOnboarding();
const { activeThemeId, mirrorTheme, pickCount } = useTheme();
const liveSnapshot = useLiveSnapshot();

const isGuest = computed(() => !!props.code);
// In a live session as host or as a connected/joining guest (drives chat UI).
const inSession = computed(
  () => live.isHosting || (isGuest.value && (live.status === "connected" || live.chat.length > 0)),
);
// Guest connection state for the joining/disconnected overlay.
const guestBlocked = computed(
  () =>
    isGuest.value &&
    (live.status === "error" ||
      live.status === "disconnected" ||
      (!editor.currentPage && live.status !== "connected")),
);
// Follow the host's theme until the viewer picks their own.
const followHostTheme = ref(true);

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
const chatOpen = ref(false);

// Whether the collapsed mini-dock is showing (mirrors PagesPanel). When it is,
// the chat icon lives in the dock; when not, it sits by the help button.
const isMobile = ref(
  typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
);
if (typeof window !== "undefined") {
  window.matchMedia("(max-width: 767px)").addEventListener("change", (e) => {
    isMobile.value = e.matches;
  });
}
const dockVisible = computed(() => pagesCollapsed.value || (isMobile.value && !panelOpen.value));

// The mini-dock's expand button means different things by viewport: on desktop
// it un-collapses the docked panel in place; on mobile there's no docked panel,
// so it slides the drawer in instead.
function onPanelToggle() {
  if (window.matchMedia("(max-width: 767px)").matches) panelOpen.value = true;
  else pagesCollapsed.value = !pagesCollapsed.value;
}

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
  // Viewer: join the session; the host's hello seeds the guest board. An `#edit`
  // token in the link asks the host for drawing permission automatically.
  if (props.code) {
    await live.join(props.code, readFragmentParam(route.hash, "edit") || undefined);
    return;
  }
  if (!projects.loaded) await projects.load();
  try {
    await editor.open(props.id!);
    // Resume a live session this tab was hosting before a page reload, reusing
    // the same code so viewers reconnect instead of needing a fresh one.
    live.resumeHostingIfPending(liveSnapshot);
    // First-board feature tour, once the open animation has settled so intro.js
    // measures the tools/panel at their final positions.
    maybeStart("editor", 700);
  } catch {
    router.replace({ name: "projects" });
  }
});

// While hosting, mirror the host's theme changes to viewers.
watch(activeThemeId, (id) => {
  if (live.isHosting) live.broadcastTheme(id);
});

// Guest: mirror the host's theme transiently until the viewer picks their own.
watch(
  () => live.viewerHostTheme,
  (id) => {
    if (id && isGuest.value && followHostTheme.value) mirrorTheme(id);
  },
  { immediate: true },
);
watch(pickCount, () => {
  if (isGuest.value) followHostTheme.value = false;
});

// Back button: host returns to projects; guest leaves the session first.
function onBack() {
  if (isGuest.value) {
    live.stop();
    editor.endGuestSession();
  }
  router.push({ name: "projects" });
}

async function reconnectGuest() {
  if (props.code) await live.join(props.code, readFragmentParam(route.hash, "edit") || undefined);
}

// Apply edits from permitted viewers. Each editor action persists and
// re-broadcasts to everyone (the author dedupes its optimistic copy by id),
// completing the round-trip.
watch(
  () => live.pendingViewerEdits.length,
  (n) => {
    if (n === 0) return;
    for (const edit of live.clearPendingViewerEdits()) {
      switch (edit.t) {
        case "viewer-stroke-commit":
          void editor.commitStroke(edit.stroke);
          break;
        case "viewer-shape-commit":
          void editor.commitShape(edit.shape);
          break;
        case "viewer-text-commit":
          void editor.commitText(edit.text);
          break;
        case "viewer-erase-stroke":
          void editor.eraseStroke(edit.strokeId);
          break;
        case "viewer-erase-shape":
          void editor.deleteShape(edit.shapeId);
          break;
        case "viewer-image-add":
          void editor.commitImage(edit.image);
          break;
        case "viewer-image-update":
          void editor.applyViewerImageUpdate(edit);
          break;
        case "viewer-image-delete":
          void editor.deleteImage(edit.imageId);
          break;
      }
    }
  },
);

watch(
  () => props.id,
  async (next, prev) => {
    if (next && next !== prev) {
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
  // Leaving the viewer: restore the viewer's own theme and drop the guest board.
  if (isGuest.value) {
    mirrorTheme(null);
    editor.endGuestSession();
  }
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
      <!-- Toolbar: always for the host; for a guest only once the host grants drawing. -->
      <Toolbar v-if="!isGuest || live.viewerCanEdit" :guest="isGuest" :collapsed="toolbarCollapsed" :panel-open="!pagesCollapsed" @toggle="toolbarCollapsed = !toolbarCollapsed" @image-import="canvasStage?.triggerFileImport()" />
      <main id="canvas-main" class="stage-wrap" aria-label="Drawing canvas" @pointerdown="helpOpen = false">
        <CanvasStage v-if="editor.currentPage && !guestBlocked" ref="canvasStage" :page="editor.currentPage" />
        <!-- Guest connection states (joining / disconnected / error). -->
        <div v-else-if="isGuest" class="guest-state">
          <div v-if="live.status === 'error'" class="state-card">
            <div class="state-title">Couldn't connect</div>
            <div class="muted state-msg">{{ live.error || "Unknown error" }}</div>
            <div class="state-actions">
              <button class="btn btn-primary" @click="reconnectGuest">Try again</button>
              <button class="btn" @click="onBack">Back</button>
            </div>
          </div>
          <div v-else-if="live.status === 'disconnected'" class="state-card">
            <div class="state-title">Disconnected</div>
            <div class="muted state-msg">{{ live.disconnectReason || "The connection was lost." }}</div>
            <div class="state-actions">
              <button class="btn btn-primary" @click="reconnectGuest">Reconnect</button>
              <button class="btn" @click="onBack">Back</button>
            </div>
          </div>
          <div v-else class="connecting">
            <div class="connecting-spinner" aria-hidden="true"></div>
            <div class="muted">
              <template v-if="live.status === 'reconnecting'">{{ live.disconnectReason || "Reconnecting…" }}</template>
              <template v-else>{{ live.status === "connecting" ? "Connecting to " + props.code + "…" : "Waiting for the host to start…" }}</template>
            </div>
          </div>
        </div>
        <div v-else class="loading muted" aria-live="polite">Loading.</div>
      </main>
      <PagesPanel :open="panelOpen" :collapsed="pagesCollapsed" :guest="isGuest" @close="panelOpen = false" @toggle="onPanelToggle" @share="shareOpen = true" @chat="chatOpen = !chatOpen" />
      <!-- Back to projects (top-left); a guest leaves the session first. -->
      <button class="back-fab" :class="{ quiet: editor.isDrawing }" @click="onBack" :title="isGuest ? 'Leave session' : 'Back to projects'" :aria-label="isGuest ? 'Leave session' : 'Back to projects'">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
        </svg>
      </button>
      <!-- Sidebar re-open pills -->
      <button v-if="toolbarCollapsed && (!isGuest || live.viewerCanEdit)" class="pencil-fab" :class="{ quiet: editor.isDrawing }" @click="toolbarCollapsed = false" title="Show tools" aria-label="Show tools">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
      <!-- Replay FAB: host-only, shown when the page has content and replay isn't active -->
      <button
        v-if="hasContent && !replay.active && !isGuest"
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
      <!-- Chat sits in the dock when collapsed; by the help button when open. -->
      <button
        v-if="inSession && !dockVisible"
        class="chat-fab"
        :class="{ quiet: editor.isDrawing, active: chatOpen, shifted: !pagesCollapsed }"
        @click="chatOpen = !chatOpen"
        title="Session chat"
        aria-label="Open session chat"
        :aria-expanded="chatOpen"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span v-if="live.unreadChat > 0" class="chat-fab-badge" aria-hidden="true"></span>
      </button>
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
  <ShareSessionModal v-if="!isGuest" :open="shareOpen" @close="shareOpen = false" />
  <ChatPanel v-if="inSession" :fab="false" v-model:open="chatOpen" />
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
  /* Follow the visual viewport (set in main.ts) so the on-screen keyboard
     doesn't push the bottom controls into a clipped, pannable dead strip. */
  height: var(--app-vh, 100dvh);
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

/* Guest (live viewer) connection states, shown in place of the canvas. */
.guest-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}
.connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}
.connecting-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-pill);
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.state-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  text-align: center;
  max-width: 380px;
  width: 100%;
}
.state-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: var(--space-2);
}
.state-msg {
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
}
.state-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: center;
  flex-wrap: wrap;
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

/* Chat FAB: same glass pill as help, sitting just to its left. */
.chat-fab {
  position: absolute;
  bottom: 16px;
  right: 56px;
  z-index: 20;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
  box-shadow: 0 2px 8px var(--color-glass-shadow);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 150ms, color 80ms, background 80ms, opacity 150ms, right 200ms ease;
}
.chat-fab:hover { box-shadow: var(--shadow-md); color: var(--color-text); }
.chat-fab.active { background: var(--color-accent-soft); color: var(--color-accent); border-color: var(--color-accent); }
.chat-fab.quiet { opacity: 0.06; pointer-events: none; }
.chat-fab-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-danger);
  border: 2px solid var(--color-surface);
}

/* When the pages panel is open on desktop it owns the right edge, so slide the
   corner FABs left to sit just clear of it. (Mobile panel is a drawer — no shift.) */
@media (min-width: 768px) {
  .help-fab.shifted { right: calc(var(--sidepanel-w) + 20px); }
  .chat-fab.shifted { right: calc(var(--sidepanel-w) + 60px); }
  .replay-fab.shifted { right: calc(var(--sidepanel-w) + 16px); }
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
  .chat-fab {
    bottom: calc(var(--safe-bottom, 0px) + 72px);
  }
  .replay-fab {
    bottom: calc(var(--safe-bottom, 0px) + 118px);
  }
  .help-fab.shifted,
  .replay-fab.shifted {
    right: 12px;
  }
  /* Beside the help button (which sits at right:12 on mobile). */
  .chat-fab.shifted {
    right: 52px;
  }
}
</style>
