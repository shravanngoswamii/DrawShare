<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { drawStack, resolveSheetColors, type SheetColors } from "@/composables/useStackRenderer";
import { useTheme } from "@/composables/useTheme";
import { adaptInk } from "@/core/ink";
import { PAGE_H, PAGE_W, sheetWorldPos } from "@/core/layout";
import type { Page } from "@/core/types";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page }>();
const live = useLiveStore();
const { isDark } = useTheme();

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
      for (const t of props.page.texts ?? []) baseRenderer.drawText(t);
      baseRenderer.endFrame();
    }
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (live.viewerLive && live.viewerLive.points.length > 0) {
    if (live.viewerIsNotebook) {
      // The live stroke is page-local; shift the camera by its sheet origin.
      const off = liveSheetOffset();
      const clipLive = live.viewerNotebookMode === "strict";
      liveRenderer.setCamera({ x: cam.x - off.x, y: cam.y - off.y, zoom: cam.zoom });
      liveRenderer.beginFrame();
      if (clipLive) liveRenderer.pushClip(PAGE_W, PAGE_H);
      liveRenderer.drawLive(live.viewerLive);
      if (clipLive) liveRenderer.popClip();
      liveRenderer.endFrame();
    } else {
      liveRenderer.beginFrame();
      liveRenderer.drawLive(live.viewerLive);
      liveRenderer.endFrame();
    }
  }
}

watch(
  () => live.viewerStrokes.length,
  () => {
    dirtyBase = true;
    schedule();
  },
);

// Notebook stack: repaint on stroke/layout/page changes across the whole stack.
watch(
  () => [live.viewerAllStrokes.length, live.viewerNotebookLayout, live.viewerNotebookMode],
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
  <div class="stage" ref="wrap" :class="{ 'is-notebook': live.viewerIsNotebook }">
    <div v-if="!live.viewerIsNotebook" class="page-bg" :class="`bg-${props.page.background}`" :style="pageBgStyle" aria-hidden="true"></div>
    <canvas ref="baseEl" class="layer"></canvas>
    <canvas ref="liveEl" class="layer"></canvas>
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
</style>
