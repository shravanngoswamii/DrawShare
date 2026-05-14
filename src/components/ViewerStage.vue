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

const pageBgStyle = ref({ width: "100%", height: "100%", left: "0px", top: "0px" });
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
  if (!host.width || !host.height || !viewW || !viewH) {
    baseRenderer.setCamera({ x: 0, y: 0, zoom: 1 });
    liveRenderer.setCamera({ x: 0, y: 0, zoom: 1 });
    pageBgStyle.value = { width: `${viewW}px`, height: `${viewH}px`, left: "0px", top: "0px" };
    return;
  }
  const scale = Math.min(viewW / host.width, viewH / host.height);
  const zoom = Math.max(0.01, scale);
  const drawnW = host.width * zoom;
  const drawnH = host.height * zoom;
  const x = (drawnW - viewW) / 2 / zoom;
  const y = (drawnH - viewH) / 2 / zoom;
  baseRenderer.setCamera({ x, y, zoom });
  liveRenderer.setCamera({ x, y, zoom });
  pageBgStyle.value = {
    width: `${drawnW}px`,
    height: `${drawnH}px`,
    left: `${(viewW - drawnW) / 2}px`,
    top: `${(viewH - drawnH) / 2}px`,
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
  () => props.page.background,
  () => {
    dirtyBase = true;
    schedule();
  },
);

watch(
  () => [live.viewerHostViewport.width, live.viewerHostViewport.height],
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
  background-color: #ffffff;
  background-repeat: repeat;
  pointer-events: none;
  box-shadow: var(--shadow-md);
}

.bg-ruled {
  background-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent 31px,
    #e2e8f0 31px,
    #e2e8f0 32px
  );
  background-size: 32px 32px;
}

.bg-grid {
  background-image:
    linear-gradient(to right, transparent 0, transparent 31px, #eef2f6 31px, #eef2f6 32px),
    linear-gradient(to bottom, transparent 0, transparent 31px, #eef2f6 31px, #eef2f6 32px);
  background-size: 32px 32px, 32px 32px;
}

.bg-dotted {
  background-image: radial-gradient(circle at 16px 16px, #cbd5e1 0.9px, transparent 1.4px);
  background-size: 32px 32px;
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
