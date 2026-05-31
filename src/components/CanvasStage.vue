<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PointerInputAdapter } from "@/adapters/input/pointerInput";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { useTheme } from "@/composables/useTheme";
import { newId } from "@/core/ids";
import { adaptInk } from "@/core/ink";
import type { InputSample } from "@/core/ports";
import type { Page, Stroke, StrokePoint, TextItem } from "@/core/types";
import { dlog } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page }>();
const editor = useEditorStore();
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
const input = new PointerInputAdapter();

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

// Camera – plain object for perf (mutated directly, not reactive)
const cam = { x: 0, y: 0, zoom: 1 };

// Reactive state for template only
const zoomLabel = ref("100%");
const bgStyle = ref({ backgroundSize: "32px 32px", backgroundPosition: "0px 0px" });
const panCursor = ref(false);

// Text tool editing overlay
const textInput = ref<HTMLTextAreaElement | null>(null);
const editing = ref<{
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  existed: boolean;
} | null>(null);
const editStyle = ref<Record<string, string>>({});

// Eraser cursor overlay (screen coords relative to the stage)
const eraseCursor = ref<{ x: number; y: number } | null>(null);

let currentStroke: Stroke | undefined;
let isErasing = false;
let textDrag: {
  item: TextItem;
  downX: number;
  downY: number;
  origX: number;
  origY: number;
  moved: boolean;
} | null = null;
let predictedPoints: StrokePoint[] = [];
let liveSendCursor = 0;
let frameQueued = false;
let dirtyBase = true;
let viewW = 0;
let viewH = 0;

// Navigation state (plain booleans – not reactive)
let spaceHeld = false;
let panActive = false;
let panPointerId: number | undefined;
let panLastX = 0;
let panLastY = 0;
const touchPoints = new Map<number, { x: number; y: number }>();
let pinchActive = false;
let pinchLastDist = 0;
let pinchLastMx = 0;
let pinchLastMy = 0;

function dpr() {
  return window.devicePixelRatio || 1;
}

function updateBg() {
  // Adaptive world-space grid: base cell = 40 world units, adapts by powers of 2
  // to keep screen spacing in [20, 100] px — scales visually with zoom.
  let worldStep = 40;
  let screenStep = worldStep * cam.zoom;
  while (screenStep < 20) {
    worldStep *= 2;
    screenStep *= 2;
  }
  while (screenStep > 100) {
    worldStep /= 2;
    screenStep /= 2;
  }
  const ox = (((-cam.x * cam.zoom) % screenStep) + screenStep) % screenStep;
  const oy = (((-cam.y * cam.zoom) % screenStep) + screenStep) % screenStep;
  bgStyle.value = {
    backgroundSize: `${screenStep}px ${screenStep}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  };
}

function syncCamera() {
  baseRenderer.setCamera({ ...cam });
  liveRenderer.setCamera({ ...cam });
  zoomLabel.value = `${Math.round(cam.zoom * 100)}%`;
  updateBg();
  updateEditStyle();
  live.setHostCamera(cam.x, cam.y, cam.zoom);
  dirtyBase = true;
  schedule();
}

function fitCanvas() {
  if (!wrap.value || !baseEl.value || !liveEl.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const ratio = dpr();
  viewW = rect.width;
  viewH = rect.height;
  baseRenderer.setViewport(viewW, viewH, ratio);
  liveRenderer.setViewport(viewW, viewH, ratio);
  // Apply current camera without resetting it
  baseRenderer.setCamera({ ...cam });
  liveRenderer.setCamera({ ...cam });
  live.setHostViewport(viewW, viewH);
  updateBg();
  dirtyBase = true;
  schedule();
}

function toWorld(sx: number, sy: number) {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}

function zoomAt(pivotX: number, pivotY: number, factor: number) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
  if (Math.abs(next - cam.zoom) < 1e-9) return;
  // World point under pivot stays fixed after zoom change
  const wx = pivotX / cam.zoom + cam.x;
  const wy = pivotY / cam.zoom + cam.y;
  cam.zoom = next;
  cam.x = wx - pivotX / cam.zoom;
  cam.y = wy - pivotY / cam.zoom;
  syncCamera();
}

function panBy(screenDx: number, screenDy: number) {
  cam.x -= screenDx / cam.zoom;
  cam.y -= screenDy / cam.zoom;
  syncCamera();
}

function resetView() {
  cam.x = 0;
  cam.y = 0;
  cam.zoom = 1;
  syncCamera();
}

function zoomIn() {
  zoomAt(viewW / 2, viewH / 2, 1.25);
}

function zoomOut() {
  zoomAt(viewW / 2, viewH / 2, 0.8);
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
    for (const t of editor.currentPage?.texts ?? []) {
      if (editing.value?.id === t.id) continue;
      baseRenderer.drawText(t);
    }
    baseRenderer.endFrame();
    dlog(`render base strokes=${editor.strokes.length} cur=${currentStroke ? "y" : "n"}`);
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (currentStroke && currentStroke.points.length > 0) {
    liveRenderer.beginFrame();
    if (predictedPoints.length > 0) {
      liveRenderer.drawLive({
        ...currentStroke,
        points: [...currentStroke.points, ...predictedPoints],
      });
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
  const w = toWorld(s.x, s.y);
  return { x: w.x, y: w.y, p: s.pressure, t: s.t };
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax,
    dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

let areaErased = false;

function eraseAt(wx: number, wy: number) {
  const r = editor.size / cam.zoom;
  if (editor.eraserMode === "area") {
    if (editor.eraseArea(props.page.id, wx, wy, r)) {
      areaErased = true;
      dirtyBase = true;
      schedule();
    }
    return;
  }
  const toDelete = editor.strokes.filter((stroke) => {
    if (stroke.pageId !== props.page.id) return false;
    const pts = stroke.points;
    if (pts.length === 0) return false;
    if (pts.length === 1) return Math.hypot(pts[0].x - wx, pts[0].y - wy) < r;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < r) return true;
    }
    return false;
  });
  if (toDelete.length === 0) return;
  for (const stroke of toDelete) editor.eraseStroke(stroke.id);
  dirtyBase = true;
  schedule();
}

// ── Text tool ────────────────────────────────────────────────────────────────

function updateEditStyle() {
  const e = editing.value;
  if (!e) return;
  editStyle.value = {
    left: `${(e.x - cam.x) * cam.zoom}px`,
    top: `${(e.y - cam.y) * cam.zoom}px`,
    fontSize: `${e.size * cam.zoom}px`,
    color: adaptInk(e.color, isDark.value),
  };
  requestAnimationFrame(autosizeText);
}

// Grow the editing box to fit its content so multiline text (shift+enter) is
// fully visible while typing instead of being clipped to one line.
function autosizeText() {
  const el = textInput.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.width = "auto";
  el.style.height = `${el.scrollHeight}px`;
  el.style.width = `${el.scrollWidth + 4}px`;
}

// Drag the text box while editing by grabbing near its dashed border. Clicks in
// the middle still place the caret for typing.
function onEditPointerDown(e: PointerEvent) {
  const el = textInput.value;
  const ed = editing.value;
  if (!el || !ed) return;
  const rect = el.getBoundingClientRect();
  const edge = 16;
  const nearBorder =
    e.clientX - rect.left < edge ||
    rect.right - e.clientX < edge ||
    e.clientY - rect.top < edge ||
    rect.bottom - e.clientY < edge;
  if (!nearBorder) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const origX = ed.x;
  const origY = ed.y;
  const onMove = (ev: PointerEvent) => {
    if (!editing.value) return;
    editing.value.x = origX + (ev.clientX - startX) / cam.zoom;
    editing.value.y = origY + (ev.clientY - startY) / cam.zoom;
    updateEditStyle();
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function hitText(t: TextItem, wx: number, wy: number): boolean {
  const lines = t.text.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const w = longest * t.size * 0.6;
  const h = lines.length * t.size * 1.3;
  return wx >= t.x && wx <= t.x + w && wy >= t.y && wy <= t.y + h;
}

function beginTextAt(wx: number, wy: number, existing?: TextItem) {
  editing.value = {
    id: existing?.id ?? newId(),
    x: existing?.x ?? wx,
    y: existing?.y ?? wy,
    text: existing?.text ?? "",
    size: existing?.size ?? editor.size * 6,
    color: existing?.color ?? editor.color,
    existed: !!existing,
  };
  updateEditStyle();
  dirtyBase = true;
  schedule();
  nextTick(() => {
    textInput.value?.focus();
    autosizeText();
  });
}

function commitEditing() {
  const e = editing.value;
  if (!e) return;
  editing.value = null;
  const text = e.text.replace(/\s+$/g, "");
  if (!text) {
    if (e.existed) editor.deleteText(props.page.id, e.id);
  } else {
    editor.commitText({
      id: e.id,
      pageId: props.page.id,
      x: e.x,
      y: e.y,
      text,
      color: e.color,
      size: e.size,
      createdAt: Date.now(),
    });
  }
  dirtyBase = true;
  schedule();
}

function handleDown(s: InputSample) {
  if (panActive || pinchActive) return;
  // Commit a focused field (e.g. the project name) when drawing starts; the
  // canvas swallows the focus change otherwise so its blur never fires.
  const active = document.activeElement as HTMLElement | null;
  if (
    active &&
    active !== textInput.value &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
  ) {
    active.blur();
  }
  if (editor.tool === "text") {
    const w = toWorld(s.x, s.y);
    if (editing.value) commitEditing();
    const hit = (props.page.texts ?? []).find((t) => hitText(t, w.x, w.y));
    if (hit) {
      // Drag to move, or tap (no move) to edit — decided in move/up.
      textDrag = { item: hit, downX: w.x, downY: w.y, origX: hit.x, origY: hit.y, moved: false };
    } else {
      beginTextAt(w.x, w.y);
    }
    return;
  }
  editor.setDrawing(true);
  if (editor.tool === "eraser") {
    isErasing = true;
    eraseCursor.value = { x: s.x, y: s.y };
    if (editor.eraserMode === "area") editor.beginAreaErase(props.page.id);
    const w = toWorld(s.x, s.y);
    eraseAt(w.x, w.y);
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
  if (panActive || pinchActive) return;
  if (textDrag) {
    const s = samples[samples.length - 1];
    const w = toWorld(s.x, s.y);
    const dx = w.x - textDrag.downX;
    const dy = w.y - textDrag.downY;
    if (!textDrag.moved && Math.hypot(dx, dy) * cam.zoom > 4) textDrag.moved = true;
    if (textDrag.moved) {
      textDrag.item.x = textDrag.origX + dx;
      textDrag.item.y = textDrag.origY + dy;
      dirtyBase = true;
      schedule();
    }
    return;
  }
  if (isErasing) {
    const last = samples[samples.length - 1];
    eraseCursor.value = { x: last.x, y: last.y };
    for (const s of samples) {
      const w = toWorld(s.x, s.y);
      eraseAt(w.x, w.y);
    }
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  for (const s of samples) currentStroke.points.push(toPagePoint(s));
  schedule();
}

function handlePredict(samples: InputSample[]) {
  if (!currentStroke || panActive || pinchActive) return;
  predictedPoints = samples.map(toPagePoint);
  schedule();
}

function appendFinalPoint(stroke: Stroke, sample?: InputSample) {
  if (!sample) return;
  const point = toPagePoint(sample);
  const last = stroke.points[stroke.points.length - 1];
  if (!last) {
    stroke.points.push(point);
    return;
  }
  if (last.x !== point.x || last.y !== point.y) {
    stroke.points.push(point);
    return;
  }
  if (stroke.points.length === 1) {
    stroke.points.push({ ...point, x: point.x + 0.0001, y: point.y + 0.0001 });
  }
}

async function handleUp(sample?: InputSample) {
  if (textDrag) {
    const d = textDrag;
    textDrag = null;
    if (d.moved) {
      editor.commitText({ ...d.item });
      dirtyBase = true;
      schedule();
    } else {
      beginTextAt(d.item.x, d.item.y, d.item);
    }
    return;
  }
  editor.setDrawing(false);
  if (isErasing) {
    isErasing = false;
    eraseCursor.value = null;
    if (areaErased) {
      areaErased = false;
      editor.flushPage(props.page.id);
    }
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  appendFinalPoint(currentStroke, sample);
  const finished = currentStroke;
  currentStroke = undefined;
  liveSendCursor = 0;
  dirtyBase = true;
  schedule();
  await editor.commitStroke(finished);
}

async function handleCancel(sample?: InputSample) {
  if (textDrag) {
    if (textDrag.moved) editor.commitText({ ...textDrag.item });
    textDrag = null;
    dirtyBase = true;
    schedule();
    return;
  }
  editor.setDrawing(false);
  if (isErasing) {
    isErasing = false;
    eraseCursor.value = null;
    if (areaErased) {
      areaErased = false;
      editor.flushPage(props.page.id);
    }
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  appendFinalPoint(currentStroke, sample);
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

// ── Navigation ─────────────────────────────────────────────────────────────

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (!wrap.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  if (e.ctrlKey || e.metaKey) {
    zoomAt(sx, sy, Math.exp(-e.deltaY / 300));
  } else {
    panBy(-e.deltaX, -e.deltaY);
  }
}

function onNavPointerDown(e: PointerEvent) {
  if (e.pointerType === "touch") {
    if (!wrap.value) return;
    const rect = wrap.value.getBoundingClientRect();
    touchPoints.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (touchPoints.size >= 2) {
      if (currentStroke || isErasing) return;
      e.preventDefault();
      const pts = Array.from(touchPoints.values());
      pinchLastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchLastMx = (pts[0].x + pts[1].x) / 2;
      pinchLastMy = (pts[0].y + pts[1].y) / 2;
      if (!pinchActive) {
        pinchActive = true;
        isErasing = false;
      }
    }
    return;
  }
  if (e.pointerType === "pen" && pinchActive) {
    pinchActive = false;
    pinchLastDist = 0;
    touchPoints.clear();
  }
  // Middle mouse or space + left drag
  if (e.button === 1 || (e.button === 0 && spaceHeld)) {
    e.preventDefault();
    panActive = true;
    panCursor.value = true;
    panPointerId = e.pointerId;
    panLastX = e.clientX;
    panLastY = e.clientY;
    wrap.value?.setPointerCapture(e.pointerId);
  }
}

function onNavPointerMove(e: PointerEvent) {
  if (e.pointerType === "touch") {
    if (!wrap.value) return;
    const rect = wrap.value.getBoundingClientRect();
    touchPoints.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (!pinchActive || touchPoints.size < 2) return;
    e.preventDefault();
    const pts = Array.from(touchPoints.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mx = (pts[0].x + pts[1].x) / 2;
    const my = (pts[0].y + pts[1].y) / 2;
    if (pinchLastDist > 0) zoomAt(pinchLastMx, pinchLastMy, dist / pinchLastDist);
    panBy(mx - pinchLastMx, my - pinchLastMy);
    pinchLastDist = dist;
    pinchLastMx = mx;
    pinchLastMy = my;
    return;
  }
  if (!panActive || panPointerId !== e.pointerId) return;
  panBy(e.clientX - panLastX, e.clientY - panLastY);
  panLastX = e.clientX;
  panLastY = e.clientY;
}

function onNavPointerUp(e: PointerEvent) {
  if (e.pointerType === "touch") {
    touchPoints.delete(e.pointerId);
    if (touchPoints.size < 2) {
      pinchActive = false;
      pinchLastDist = 0;
    }
    return;
  }
  if (panActive && panPointerId === e.pointerId) {
    panActive = false;
    panCursor.value = spaceHeld;
    panPointerId = undefined;
    try {
      wrap.value?.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore DOMException if already released
    }
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
  if (e.code === "Space") {
    e.preventDefault();
    spaceHeld = true;
    panCursor.value = true;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === "Space") {
    spaceHeld = false;
    panActive = false;
    panCursor.value = false;
  }
}

// ── Watchers ───────────────────────────────────────────────────────────────

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
    commitEditing();
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
  () => editor.currentPage?.texts,
  () => {
    dirtyBase = true;
    schedule();
  },
  { deep: true },
);

// ── Lifecycle ──────────────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  if (!baseEl.value || !liveEl.value || !wrap.value) return;
  baseRenderer.attach(baseEl.value);
  liveRenderer.attach(liveEl.value);
  applyInkAdapter();
  fitCanvas();
  wrap.value.addEventListener("wheel", onWheel, { passive: false });
  wrap.value.addEventListener("pointerdown", onNavPointerDown, { capture: true, passive: false });
  wrap.value.addEventListener("pointermove", onNavPointerMove, { capture: true, passive: false });
  wrap.value.addEventListener("pointerup", onNavPointerUp, { capture: true });
  wrap.value.addEventListener("pointercancel", onNavPointerUp, { capture: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
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

// Re-paint ink when the theme flips (dark-mode ink adaptation is render-time).
watch(isDark, () => {
  applyInkAdapter();
  updateEditStyle();
  dirtyBase = true;
  schedule();
});

onBeforeUnmount(() => {
  commitEditing();
  input.stop();
  if (wrap.value) {
    wrap.value.removeEventListener("wheel", onWheel);
    wrap.value.removeEventListener("pointerdown", onNavPointerDown, true);
    wrap.value.removeEventListener("pointermove", onNavPointerMove, true);
    wrap.value.removeEventListener("pointerup", onNavPointerUp, true);
    wrap.value.removeEventListener("pointercancel", onNavPointerUp, true);
  }
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="stage" ref="wrap" :class="{ 'pan-cursor': panCursor }">
    <div class="page-bg" :class="`bg-${props.page.background}`" :style="bgStyle" aria-hidden="true"></div>
    <canvas ref="baseEl" class="layer base"></canvas>
    <canvas ref="liveEl" class="layer live"></canvas>
    <textarea
      v-if="editing"
      ref="textInput"
      v-model="editing.text"
      class="text-edit"
      :style="editStyle"
      rows="1"
      spellcheck="false"
      placeholder="Type..."
      @input="autosizeText"
      @pointerdown="onEditPointerDown"
      @blur="commitEditing"
      @keydown.escape.prevent="commitEditing"
      @keydown.enter.exact.prevent="commitEditing"
    ></textarea>
    <div
      v-if="eraseCursor"
      class="eraser-cursor"
      :class="editor.eraserShape"
      :style="{ left: `${eraseCursor.x}px`, top: `${eraseCursor.y}px`, width: `${editor.size * 2}px`, height: `${editor.size * 2}px` }"
    ></div>
    <div class="cam-controls">
      <button class="cam-btn" title="Zoom out" @click="zoomOut">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M5 12h14"/>
        </svg>
      </button>
      <button class="cam-btn cam-zoom-label" title="Reset view" @click="resetView">
        {{ zoomLabel }}
      </button>
      <button class="cam-btn" title="Zoom in" @click="zoomIn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--color-canvas-surface);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.stage.pan-cursor {
  cursor: grab;
}

.stage.pan-cursor:active {
  cursor: grabbing;
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
  background: transparent;
  forced-color-adjust: none;
}

.live {
  touch-action: none;
}

.eraser-cursor {
  position: absolute;
  z-index: 6;
  transform: translate(-50%, -50%);
  border: 1.5px solid var(--color-ink);
  background: var(--color-ink-fill);
  pointer-events: none;
}
.eraser-cursor.circle { border-radius: 50%; }
.eraser-cursor.square { border-radius: 3px; }

.text-edit {
  position: absolute;
  z-index: 6;
  margin: -4px 0 0 -6px;
  padding: 2px 5px;
  border: 1.5px dashed var(--color-accent, #3b82f6);
  border-radius: 6px;
  background: var(--color-glass-bg);
  box-shadow: 0 2px 10px var(--color-glass-shadow);
  outline: none;
  resize: none;
  overflow: hidden;
  white-space: pre;
  line-height: 1.3;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  transform-origin: top left;
  min-width: 8px;
  min-height: 1.3em;
}

.cam-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 12px;
  padding: 4px;
  box-shadow: 0 8px 24px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
  z-index: 5;
  transition: opacity 150ms ease;
}

.cam-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}

.cam-btn:active {
  transform: scale(0.94);
}

.cam-zoom-label {
  font-size: var(--text-xs);
  font-weight: 600;
  min-width: 52px;
  letter-spacing: 0.02em;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.cam-btn:hover {
  background: rgba(15, 23, 42, 0.07);
}
</style>
