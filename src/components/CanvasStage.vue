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
let isErasing = false;
let predictedPoints: StrokePoint[] = [];
let liveSendCursor = 0;
let frameQueued = false;
let dirtyBase = true;
let viewW = 0;
let viewH = 0;

function dpr() {
  return window.devicePixelRatio || 1;
}

function fitCanvas() {
  if (!wrap.value || !baseEl.value || !liveEl.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const ratio = dpr();
  viewW = rect.width;
  viewH = rect.height;
  baseRenderer.setViewport(viewW, viewH, ratio);
  liveRenderer.setViewport(viewW, viewH, ratio);
  baseRenderer.setCamera({ x: 0, y: 0, zoom: 1 });
  liveRenderer.setCamera({ x: 0, y: 0, zoom: 1 });
  live.setHostViewport(viewW, viewH);
  dirtyBase = true;
  schedule();
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
    for (const s of editor.strokes) baseRenderer.drawStroke(s);
    baseRenderer.endFrame();
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (currentStroke && currentStroke.points.length > 0) {
    liveRenderer.beginFrame();
    if (predictedPoints.length > 0) {
      liveRenderer.drawLive({ ...currentStroke, points: [...currentStroke.points, ...predictedPoints] });
    } else {
      liveRenderer.drawLive(currentStroke);
    }
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

function toPagePoint(s: InputSample): StrokePoint {
  return {
    x: s.x,
    y: s.y,
    p: s.pressure,
    t: s.t,
  };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function eraseAt(x: number, y: number) {
  const r = editor.size * 4 + 8;
  const toDelete = editor.strokes.filter((stroke) => {
    if (stroke.pageId !== props.page.id) return false;
    const pts = stroke.points;
    if (pts.length === 0) return false;
    if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y) < r;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < r) return true;
    }
    return false;
  });
  if (toDelete.length === 0) return;
  for (const stroke of toDelete) editor.eraseStroke(stroke.id);
  dirtyBase = true;
  schedule();
}

function handleDown(s: InputSample) {
  if (editor.tool === "eraser") {
    isErasing = true;
    eraseAt(s.x, s.y);
    return;
  }
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
  if (isErasing) {
    for (const s of samples) eraseAt(s.x, s.y);
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  for (const s of samples) currentStroke.points.push(toPagePoint(s));
  schedule();
}

function handlePredict(samples: InputSample[]) {
  if (!currentStroke) return;
  predictedPoints = samples.map(toPagePoint);
  schedule();
}

async function handleUp() {
  if (isErasing) { isErasing = false; return; }
  if (!currentStroke) return;
  predictedPoints = [];
  const finished = currentStroke;
  currentStroke = undefined;
  liveSendCursor = 0;
  dirtyBase = true;
  schedule();
  await editor.commitStroke(finished);
}

async function handleCancel() {
  if (isErasing) { isErasing = false; return; }
  if (!currentStroke) return;
  predictedPoints = [];
  if (currentStroke.points.length >= 2) {
    const partial = currentStroke;
    currentStroke = undefined;
    liveSendCursor = 0;
    dirtyBase = true;
    schedule();
    await editor.commitStroke(partial);
  } else {
    if (live.mode === "host") {
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
    onPredict: handlePredict,
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
    <div class="page-bg" :class="`bg-${props.page.background}`" aria-hidden="true"></div>
    <canvas ref="baseEl" class="layer base"></canvas>
    <canvas ref="liveEl" class="layer live"></canvas>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: #ffffff;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
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
  background: transparent;
  forced-color-adjust: none;
}

.live {
  touch-action: none;
}
</style>
