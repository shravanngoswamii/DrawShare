<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { useTheme } from "@/composables/useTheme";
import { adaptInk } from "@/core/ink";
import type { Page } from "@/core/types";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page }>();
const live = useLiveStore();
const { isDark } = useTheme();

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
    baseRenderer.beginFrame();
    for (const s of live.viewerStrokes) {
      if (s.pageId === props.page.id) baseRenderer.drawStroke(s);
    }
    for (const t of props.page.texts ?? []) baseRenderer.drawText(t);
    baseRenderer.endFrame();
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (live.viewerLive && live.viewerLive.points.length > 0) {
    liveRenderer.beginFrame();
    liveRenderer.drawLive(live.viewerLive);
    liveRenderer.endFrame();
  }
}

watch(
  () => live.viewerStrokes.length,
  () => {
    dirtyBase = true;
    schedule();
  },
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

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  if (!baseEl.value || !liveEl.value || !wrap.value) return;
  baseRenderer.attach(baseEl.value);
  liveRenderer.attach(liveEl.value);
  applyInkAdapter();
  fitCanvas();
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
});

watch(isDark, () => {
  applyInkAdapter();
  dirtyBase = true;
  schedule();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="stage" ref="wrap">
    <div class="page-bg" :class="`bg-${props.page.background}`" :style="pageBgStyle" aria-hidden="true"></div>
    <canvas ref="baseEl" class="layer"></canvas>
    <canvas ref="liveEl" class="layer"></canvas>
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
