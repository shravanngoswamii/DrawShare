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

function fitCanvas() {
  if (!wrap.value || !baseEl.value || !liveEl.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const ratio = dpr();
  baseRenderer.setViewport(rect.width, rect.height, ratio);
  liveRenderer.setViewport(rect.width, rect.height, ratio);
  computeCamera(rect.width, rect.height);
  dirtyBase = true;
  schedule();
}

function computeCamera(viewW: number, viewH: number) {
  const page = props.page;
  const margin = 32;
  const scale = Math.min(
    (viewW - margin * 2) / page.width,
    (viewH - margin * 2) / page.height,
  );
  const zoom = Math.max(0.1, Math.min(2, scale));
  const x = (page.width * zoom - viewW) / 2 / zoom;
  const y = (page.height * zoom - viewH) / 2 / zoom;
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
  const page = props.page;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, page.width - 1, page.height - 1);

  if (page.background === "ruled") {
    ctx.strokeStyle = "#e5e7eb";
    for (let y = 64; y < page.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(page.width, y + 0.5);
      ctx.stroke();
    }
  } else if (page.background === "grid") {
    ctx.strokeStyle = "#eef2f6";
    for (let x = 32; x < page.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, page.height);
      ctx.stroke();
    }
    for (let y = 32; y < page.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(page.width, y + 0.5);
      ctx.stroke();
    }
  } else if (page.background === "dotted") {
    ctx.fillStyle = "#d4d4d8";
    for (let y = 32; y < page.height; y += 32) {
      for (let x = 32; x < page.width; x += 32) {
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
}
</style>
