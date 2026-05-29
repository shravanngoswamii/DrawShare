<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import type { Page } from "@/core/types";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page }>();
const live = useLiveStore();

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
  baseRenderer.setCamera({ x, y, zoom });
  liveRenderer.setCamera({ x, y, zoom });
  // Scrolling grid background that follows the camera
  let worldStep = 40;
  let screenStep = worldStep * zoom;
  while (screenStep < 20) { worldStep *= 2; screenStep *= 2; }
  while (screenStep > 100) { worldStep /= 2; screenStep /= 2; }
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

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  if (!baseEl.value || !liveEl.value || !wrap.value) return;
  baseRenderer.attach(baseEl.value);
  liveRenderer.attach(liveEl.value);
  fitCanvas();
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
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
  background-color: #ffffff;
  background-repeat: repeat;
  pointer-events: none;
}

.bg-ruled {
  background-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(100% - 1px),
    #e2e8f0 calc(100% - 1px),
    #e2e8f0 100%
  );
}

.bg-grid {
  background-image:
    linear-gradient(to right, transparent calc(100% - 1px), #eef2f6 calc(100% - 1px), #eef2f6 100%),
    linear-gradient(to bottom, transparent calc(100% - 1px), #eef2f6 calc(100% - 1px), #eef2f6 100%);
}

.bg-dotted {
  background-image: radial-gradient(circle at 50% 50%, #cbd5e1 1.5px, transparent 2.5px);
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
