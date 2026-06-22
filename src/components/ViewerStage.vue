<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { drawStack, resolveSheetColors, type SheetColors } from "@/composables/useStackRenderer";
import { useTheme } from "@/composables/useTheme";
import { newId } from "@/core/ids";
import { adaptInk } from "@/core/ink";
import { PAGE_H, PAGE_W, sheetWorldPos } from "@/core/layout";
import type { Page, Stroke, StrokePoint } from "@/core/types";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page; color?: string; size?: number }>();
const live = useLiveStore();
const { isDark } = useTheme();

// The viewer can draw only when the host has granted it, and only in free mode
// (notebook stroke coordinates are page-local and not yet supported here).
const canDraw = computed(() => live.viewerCanEdit && !live.viewerIsNotebook);

// World camera reconstructed from the host (used to offset the notebook live stroke).
const cam = { x: 0, y: 0, zoom: 1 };
let sheetColors: SheetColors = {
  paper: "#ffffff",
  line: "rgba(148,163,184,0.4)",
  dot: "rgba(148,163,184,0.6)",
};

function liveSheetOffset() {
  const id = live.viewerLive?.pageId;
  if (!id) return { x: 0, y: 0 };
  const i = live.viewerPages.findIndex((p) => p.id === id);
  return i >= 0 ? sheetWorldPos(i, live.viewerNotebookLayout) : { x: 0, y: 0 };
}

function applyInkAdapter() {
  baseRenderer.setInkAdapter((c) => adaptInk(c, isDark.value));
  liveRenderer.setInkAdapter((c) => adaptInk(c, isDark.value));
}

const wrap = ref<HTMLDivElement | null>(null);
const baseEl = ref<HTMLCanvasElement | null>(null);
const liveEl = ref<HTMLCanvasElement | null>(null);

const baseRenderer = new Canvas2DRenderer();
const liveRenderer = new Canvas2DRenderer();

let frameQueued = false;
let dirtyBase = true;

function dpr() {
  return window.devicePixelRatio || 1;
}

const pageBgStyle = ref({ backgroundSize: "32px 32px", backgroundPosition: "0px 0px" });
const screenCam = ref({ x: 0, y: 0, zoom: 1 });
let viewW = 0;
let viewH = 0;

function fitCanvas() {
  if (!wrap.value || !baseEl.value || !liveEl.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const ratio = dpr();
  viewW = rect.width;
  viewH = rect.height;
  baseRenderer.setViewport(viewW, viewH, ratio);
  liveRenderer.setViewport(viewW, viewH, ratio);
  computeCamera();
  dirtyBase = true;
  schedule();
}

function computeCamera() {
  const host = live.viewerHostViewport;
  const hc = live.viewerHostCamera;
  if (!host.width || !host.height || !viewW || !viewH) {
    baseRenderer.setCamera({ x: 0, y: 0, zoom: 1 });
    liveRenderer.setCamera({ x: 0, y: 0, zoom: 1 });
    pageBgStyle.value = { backgroundSize: "32px 32px", backgroundPosition: "0px 0px" };
    return;
  }
  // Fit the host's screen into the viewer's screen
  const scale = Math.min(viewW / host.width, viewH / host.height);
  const zoom = Math.max(0.01, hc.zoom * scale);
  const padX = (viewW - host.width * scale) / 2;
  const padY = (viewH - host.height * scale) / 2;
  const x = hc.x - padX / zoom;
  const y = hc.y - padY / zoom;
  cam.x = x;
  cam.y = y;
  cam.zoom = zoom;
  baseRenderer.setCamera({ x, y, zoom });
  liveRenderer.setCamera({ x, y, zoom });
  screenCam.value = { x, y, zoom };
  // Scrolling grid background that follows the camera
  let worldStep = 40;
  let screenStep = worldStep * zoom;
  while (screenStep < 20) {
    worldStep *= 2;
    screenStep *= 2;
  }
  while (screenStep > 100) {
    worldStep /= 2;
    screenStep /= 2;
  }
  const ox = (((-x * zoom) % screenStep) + screenStep) % screenStep;
  const oy = (((-y * zoom) % screenStep) + screenStep) % screenStep;
  pageBgStyle.value = {
    backgroundSize: `${screenStep}px ${screenStep}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  };
}

function schedule() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(render);
}

function render() {
  frameQueued = false;
  if (dirtyBase) {
    baseRenderer.clear();
    if (live.viewerIsNotebook) {
      // Mirror the host's continuous A4 stack from page-local strokes.
      drawStack(
        baseRenderer,
        live.viewerPages,
        live.viewerAllStrokes,
        live.viewerAllShapes,
        // Images are not broadcast to viewers yet (large data URLs, no chunking).
        [],
        live.viewerNotebookLayout,
        sheetColors,
        {
          clip: live.viewerNotebookMode === "strict",
        },
      );
    } else {
      baseRenderer.beginFrame();
      for (const s of live.viewerStrokes) {
        if (s.pageId === props.page.id) baseRenderer.drawStroke(s);
      }
      for (const sh of live.viewerShapes) {
        if (sh.pageId === props.page.id) baseRenderer.drawShape(sh);
      }
      for (const t of props.page.texts ?? []) baseRenderer.drawText(t);
      baseRenderer.endFrame();
    }
    dirtyBase = false;
  }
  liveRenderer.clear();
  const hostLive = live.viewerLive;
  const ownLive = live.viewerOwnLive;
  if (live.viewerIsNotebook) {
    if (hostLive && hostLive.points.length > 0) {
      // The live stroke is page-local; shift the camera by its sheet origin.
      const off = liveSheetOffset();
      const clipLive = live.viewerNotebookMode === "strict";
      liveRenderer.setCamera({ x: cam.x - off.x, y: cam.y - off.y, zoom: cam.zoom });
      liveRenderer.beginFrame();
      if (clipLive) liveRenderer.pushClip(PAGE_W, PAGE_H);
      liveRenderer.drawLive(hostLive);
      if (clipLive) liveRenderer.popClip();
      liveRenderer.endFrame();
    }
  } else if ((hostLive && hostLive.points.length > 0) || (ownLive && ownLive.points.length > 0)) {
    // Both the host's and this viewer's in-progress strokes share the world camera.
    liveRenderer.beginFrame();
    if (hostLive && hostLive.points.length > 0) liveRenderer.drawLive(hostLive);
    if (ownLive && ownLive.points.length > 0) liveRenderer.drawLive(ownLive);
    liveRenderer.endFrame();
  }
}

watch(
  () => [live.viewerStrokes.length, live.viewerShapes.length],
  () => {
    dirtyBase = true;
    schedule();
  },
);

// Notebook stack: repaint on stroke/shape/layout/page changes across the whole stack.
watch(
  () => [
    live.viewerAllStrokes.length,
    live.viewerAllShapes.length,
    live.viewerNotebookLayout,
    live.viewerNotebookMode,
  ],
  () => {
    dirtyBase = true;
    schedule();
  },
);
watch(
  () => live.viewerPages,
  () => {
    dirtyBase = true;
    schedule();
  },
  { deep: true },
);

watch(
  () => live.viewerLive,
  () => schedule(),
  { deep: true },
);

// ── Viewer drawing (only while the host has granted permission) ──
function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const { x, y, zoom } = screenCam.value;
  return { x: sx / zoom + x, y: sy / zoom + y };
}

let drawing: Stroke | undefined;
let activePointer: number | undefined;

function onPointerDown(ev: PointerEvent) {
  if (!canDraw.value || activePointer !== undefined || !wrap.value) return;
  ev.preventDefault();
  wrap.value.setPointerCapture(ev.pointerId);
  activePointer = ev.pointerId;
  const rect = wrap.value.getBoundingClientRect();
  const wp = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const now = Date.now();
  drawing = {
    id: newId(),
    pageId: props.page.id,
    tool: "pen",
    penType: "ballpoint",
    color: props.color ?? "#0f172a",
    size: props.size ?? 4,
    opacity: 1,
    points: [{ x: wp.x, y: wp.y, p: ev.pressure || 0.5, t: now }],
    createdAt: now,
  };
  live.setViewerOwnLive({ ...drawing });
  live.sendViewerStroke({ t: "viewer-stroke-begin", vid: live.viewerId, stroke: { ...drawing } });
  schedule();
}

function onPointerMove(ev: PointerEvent) {
  if (activePointer !== ev.pointerId || !drawing || !wrap.value) return;
  ev.preventDefault();
  const rect = wrap.value.getBoundingClientRect();
  const wp = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const point: StrokePoint = { x: wp.x, y: wp.y, p: ev.pressure || 0.5, t: Date.now() };
  const from = drawing.points.length;
  drawing.points = [...drawing.points, point];
  live.setViewerOwnLive({ ...drawing });
  live.sendViewerStroke({
    t: "viewer-stroke-points",
    vid: live.viewerId,
    pageId: drawing.pageId,
    strokeId: drawing.id,
    points: [point],
    from,
  });
  schedule();
}

function onPointerUp(ev: PointerEvent) {
  if (activePointer !== ev.pointerId) return;
  activePointer = undefined;
  if (!drawing) return;
  const finalized = { ...drawing };
  drawing = undefined;
  // Optimistic local commit; the host persists it and echoes a stroke-commit,
  // which the base-layer dedupe (by id) drops, so it isn't drawn twice.
  live.viewerStrokes = [...live.viewerStrokes, finalized];
  dirtyBase = true;
  live.setViewerOwnLive(undefined);
  live.sendViewerStroke({ t: "viewer-stroke-commit", vid: live.viewerId, stroke: finalized });
  schedule();
}

function onPointerCancel(ev: PointerEvent) {
  if (activePointer !== ev.pointerId) return;
  activePointer = undefined;
  if (drawing) {
    live.sendViewerStroke({
      t: "viewer-stroke-cancel",
      vid: live.viewerId,
      pageId: drawing.pageId,
      strokeId: drawing.id,
    });
  }
  drawing = undefined;
  live.setViewerOwnLive(undefined);
  schedule();
}

watch(
  () => live.viewerOwnLive,
  () => schedule(),
  { deep: true },
);
// If permission is revoked mid-stroke, drop the in-progress stroke.
watch(canDraw, (allowed) => {
  if (!allowed && drawing) {
    drawing = undefined;
    activePointer = undefined;
    live.setViewerOwnLive(undefined);
    schedule();
  }
});

watch(
  () => props.page.id,
  () => {
    dirtyBase = true;
    schedule();
  },
);

watch(
  () => props.page.texts,
  () => {
    dirtyBase = true;
    schedule();
  },
  { deep: true },
);

watch(
  () => props.page.background,
  () => {
    dirtyBase = true;
    schedule();
  },
);

watch(
  () => [
    live.viewerHostViewport.width,
    live.viewerHostViewport.height,
    live.viewerHostCamera.x,
    live.viewerHostCamera.y,
    live.viewerHostCamera.zoom,
  ],
  () => {
    computeCamera();
    dirtyBase = true;
    schedule();
  },
);

const presenterScreen = computed(() => {
  const p = live.viewerPresenter;
  if (!p) return null;
  const { x: cx, y: cy, zoom } = screenCam.value;
  return {
    x: (p.x - cx) * zoom,
    y: (p.y - cy) * zoom,
    mode: p.mode,
  };
});

// Stitch the host's laser points (world coords) into a glowing trail, mirroring
// the editor. Cleared when the host releases (presenter-off → viewerPresenter null)
// or switches to spotlight.
const viewerLaserTrail = ref<{ x: number; y: number }[]>([]);
watch(
  () => live.viewerPresenter,
  (p) => {
    if (p && p.mode === "laser") {
      const next = [...viewerLaserTrail.value, { x: p.x, y: p.y }];
      if (next.length > 1200) next.shift();
      viewerLaserTrail.value = next;
    } else {
      viewerLaserTrail.value = [];
    }
  },
);
const viewerLaserPath = computed(() => {
  if (viewerLaserTrail.value.length < 2) return "";
  const { x: cx, y: cy, zoom } = screenCam.value;
  return viewerLaserTrail.value.map((p) => `${(p.x - cx) * zoom},${(p.y - cy) * zoom}`).join(" ");
});

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  if (!baseEl.value || !liveEl.value || !wrap.value) return;
  baseRenderer.attach(baseEl.value);
  liveRenderer.attach(liveEl.value);
  applyInkAdapter();
  sheetColors = resolveSheetColors(wrap.value);
  fitCanvas();
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
});

watch(isDark, () => {
  applyInkAdapter();
  if (wrap.value) sheetColors = resolveSheetColors(wrap.value);
  dirtyBase = true;
  schedule();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div
    class="stage"
    ref="wrap"
    :class="{ 'is-notebook': live.viewerIsNotebook, drawable: canDraw }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div v-if="!live.viewerIsNotebook" class="page-bg" :class="`bg-${props.page.background}`" :style="pageBgStyle" aria-hidden="true"></div>
    <canvas ref="baseEl" class="layer"></canvas>
    <canvas ref="liveEl" class="layer"></canvas>
    <svg
      v-if="presenterScreen && presenterScreen.mode === 'laser' && viewerLaserTrail.length > 1"
      class="laser-trail"
      aria-hidden="true"
    >
      <polyline :points="viewerLaserPath" />
    </svg>
    <div
      v-if="presenterScreen && presenterScreen.mode === 'laser'"
      class="laser-dot"
      :style="{ left: `${presenterScreen.x}px`, top: `${presenterScreen.y}px` }"
      aria-hidden="true"
    ></div>
    <div
      v-if="presenterScreen && presenterScreen.mode === 'spotlight'"
      class="spotlight-overlay"
      :style="{ '--sx': `${presenterScreen.x}px`, '--sy': `${presenterScreen.y}px` }"
      aria-hidden="true"
    ></div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--color-surface-2);
  overflow: hidden;
}

/* Notebook mode: neutral desk backdrop behind the white A4 sheets. */
.stage.is-notebook {
  background: var(--color-bg);
}

/* When the host has granted drawing, the stage takes pointer input. */
.stage.drawable {
  cursor: crosshair;
  touch-action: none;
}

.page-bg {
  position: absolute;
  inset: 0;
  background-color: var(--color-canvas-surface);
  background-repeat: repeat;
  pointer-events: none;
}

.bg-ruled {
  background-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(100% - 1px),
    var(--color-canvas-line) calc(100% - 1px),
    var(--color-canvas-line) 100%
  );
}

.bg-grid {
  background-image:
    linear-gradient(to right, transparent calc(100% - 1px), var(--color-canvas-line) calc(100% - 1px), var(--color-canvas-line) 100%),
    linear-gradient(to bottom, transparent calc(100% - 1px), var(--color-canvas-line) calc(100% - 1px), var(--color-canvas-line) 100%);
}

.bg-dotted {
  background-image: radial-gradient(circle at 50% 50%, var(--color-canvas-dot) 1.5px, transparent 2.5px);
}

.layer {
  position: absolute;
  inset: 0;
  display: block;
  pointer-events: none;
  background: transparent;
  forced-color-adjust: none;
}

.laser-trail {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
  overflow: visible;
}
.laser-trail polyline {
  fill: none;
  stroke: rgba(239, 68, 68, 0.92);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.75));
}

.laser-dot {
  position: absolute;
  z-index: 10;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.92);
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.28), 0 0 18px rgba(239, 68, 68, 0.55);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: laser-pulse 1.2s ease-in-out infinite;
}

@keyframes laser-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.28), 0 0 18px rgba(239, 68, 68, 0.55); }
  50% { box-shadow: 0 0 0 9px rgba(239, 68, 68, 0.12), 0 0 30px rgba(239, 68, 68, 0.35); }
}

.spotlight-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  background: radial-gradient(
    circle 130px at var(--sx, 50%) var(--sy, 50%),
    transparent 0%,
    transparent 85px,
    rgba(0, 0, 0, 0.72) 130px
  );
}
</style>
