<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PointerInputAdapter } from "@/adapters/input/pointerInput";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { newId } from "@/core/ids";
import type { InputSample } from "@/core/ports";
import type { Page, Stroke, StrokePoint } from "@/core/types";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page }>();
const editor = useEditorStore();
const live = useLiveStore();

const wrap = ref<HTMLDivElement | null>(null);
const baseEl = ref<HTMLCanvasElement | null>(null);
const liveEl = ref<HTMLCanvasElement | null>(null);

const baseRenderer = new Canvas2DRenderer();
const liveRenderer = new Canvas2DRenderer();
const input = new PointerInputAdapter();

let currentStroke: Stroke | undefined;
let liveSendCursor = 0;
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
    drawPageBackground(baseRenderer);
    for (const s of editor.strokes) baseRenderer.drawStroke(s);
    baseRenderer.endFrame();
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (currentStroke && currentStroke.points.length > 0) {
    liveRenderer.beginFrame();
    liveRenderer.drawLive(currentStroke);
    liveRenderer.endFrame();
    if (live.mode === "host" && currentStroke.points.length > liveSendCursor) {
      const newPoints = currentStroke.points.slice(liveSendCursor);
      live.broadcast({
        t: "stroke-points",
        pageId: currentStroke.pageId,
        strokeId: currentStroke.id,
        points: newPoints,
        from: liveSendCursor,
      });
      liveSendCursor = currentStroke.points.length;
    }
  }
}

function drawPageBackground(r: Canvas2DRenderer) {
  const ctx = (r as unknown as { ctx: CanvasRenderingContext2D }).ctx;
  if (!ctx) return;
  const page = props.page;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, page.width - 1, page.height - 1);

  if (page.background === "ruled") {
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for (let y = 64; y < page.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(page.width, y + 0.5);
      ctx.stroke();
    }
  } else if (page.background === "grid") {
    ctx.strokeStyle = "#eef2f6";
    ctx.lineWidth = 1;
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

function toPagePoint(s: InputSample): StrokePoint {
  const cam = (baseRenderer as unknown as { camera: { x: number; y: number; zoom: number } }).camera;
  return {
    x: s.x / cam.zoom + cam.x,
    y: s.y / cam.zoom + cam.y,
    p: s.pressure,
    t: s.t,
  };
}

function handleDown(s: InputSample) {
  if (editor.tool === "eraser") return;
  const point = toPagePoint(s);
  currentStroke = {
    id: newId(),
    pageId: props.page.id,
    tool: editor.tool,
    color: editor.color,
    size: editor.size,
    opacity: editor.tool === "highlighter" ? 0.35 : editor.opacity,
    points: [point],
    createdAt: Date.now(),
  };
  liveSendCursor = 0;
  if (live.mode === "host") {
    live.broadcast({ t: "stroke-begin", stroke: { ...currentStroke, points: [point] } });
    liveSendCursor = 1;
  }
  schedule();
}

function handleMove(samples: InputSample[]) {
  if (!currentStroke) return;
  for (const s of samples) currentStroke.points.push(toPagePoint(s));
  schedule();
}

async function handleUp() {
  if (!currentStroke) return;
  const finished = currentStroke;
  currentStroke = undefined;
  liveSendCursor = 0;
  dirtyBase = true;
  schedule();
  await editor.commitStroke(finished);
}

function handleCancel() {
  if (currentStroke && live.mode === "host") {
    live.broadcast({
      t: "stroke-cancel",
      pageId: currentStroke.pageId,
      strokeId: currentStroke.id,
    });
  }
  currentStroke = undefined;
  liveSendCursor = 0;
  schedule();
}

watch(
  () => editor.strokes.length,
  () => {
    dirtyBase = true;
    schedule();
  },
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
  input.start(liveEl.value, {
    onDown: handleDown,
    onMove: handleMove,
    onUp: handleUp,
    onCancel: handleCancel,
  });
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
});

onBeforeUnmount(() => {
  input.stop();
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="stage" ref="wrap">
    <canvas ref="baseEl" class="layer base"></canvas>
    <canvas ref="liveEl" class="layer live"></canvas>
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
  background: transparent;
}

.base {
  background: var(--color-surface-2);
}

.live {
  touch-action: none;
}
</style>
