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
    drawPageBackground();
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

function drawPageBackground() {
  const ctx = (baseRenderer as unknown as { ctx: CanvasRenderingContext2D }).ctx;
  if (!ctx) return;
  const w = live.viewerHostViewport.width;
  const h = live.viewerHostViewport.height;
  const bg = props.page.background;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (bg === "ruled") {
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let y = 32; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
  } else if (bg === "grid") {
    ctx.strokeStyle = "#eef2f6";
    for (let x = 32; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 32; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
  } else if (bg === "dotted") {
    ctx.fillStyle = "#cbd5e1";
    for (let y = 32; y < h; y += 32) {
      for (let x = 32; x < w; x += 32) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
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

.layer {
  position: absolute;
  inset: 0;
  display: block;
  pointer-events: none;
  background: transparent;
}

.stage > canvas:first-of-type {
  background: var(--color-surface-2);
}
</style>
