<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { decodeSnapshot, type SnapshotData } from "@/composables/useSnapshot";
import { useTheme } from "@/composables/useTheme";
import { splitImageLayers } from "@/core/images";
import { adaptInk } from "@/core/ink";

const route = useRoute();
const router = useRouter();
const { isDark } = useTheme();

const wrap = ref<HTMLDivElement | null>(null);
const baseEl = ref<HTMLCanvasElement | null>(null);

const renderer = new Canvas2DRenderer();

const state = ref<"loading" | "error" | "ready">("loading");
const errorMsg = ref("");
const snapshot = ref<SnapshotData | null>(null);
const copied = ref(false);

let viewW = 0;
let viewH = 0;
let camX = 0;
let camY = 0;
let camZoom = 1;
let frameQueued = false;

const pageBgStyle = ref({ backgroundSize: "32px 32px", backgroundPosition: "0px 0px" });

function dpr() {
  return window.devicePixelRatio || 1;
}

function applyInkAdapter() {
  renderer.setInkAdapter((c) => adaptInk(c, isDark.value));
}

function updateBgStyle() {
  let worldStep = 40;
  let screenStep = worldStep * camZoom;
  while (screenStep < 20) {
    worldStep *= 2;
    screenStep *= 2;
  }
  while (screenStep > 100) {
    worldStep /= 2;
    screenStep /= 2;
  }
  const ox = (((-camX * camZoom) % screenStep) + screenStep) % screenStep;
  const oy = (((-camY * camZoom) % screenStep) + screenStep) % screenStep;
  pageBgStyle.value = {
    backgroundSize: `${screenStep}px ${screenStep}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  };
}

function schedule() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(renderFrame);
}

function renderFrame() {
  frameQueued = false;
  if (!snapshot.value) return;
  const { strokes, texts, shapes = [], images = [] } = snapshot.value;
  // Same paint order as the editor: back images, ink, shapes, text, front images.
  const { behind, front } = splitImageLayers(images);
  renderer.setCamera({ x: camX, y: camY, zoom: camZoom });
  renderer.clear();
  renderer.beginFrame();
  for (const img of behind) renderer.drawImageItem(img);
  for (const s of strokes) renderer.drawStroke(s);
  for (const sh of shapes) renderer.drawShape(sh);
  for (const t of texts) renderer.drawText(t);
  for (const img of front) renderer.drawImageItem(img);
  renderer.endFrame();
}

function fitContent() {
  if (!snapshot.value) return;
  const { strokes, texts, shapes = [], images = [], width, height } = snapshot.value;

  if (strokes.length === 0 && texts.length === 0 && shapes.length === 0 && images.length === 0) {
    camZoom = Math.min(viewW / width, viewH / height) * 0.9;
    camX = (width - viewW / camZoom) / 2;
    camY = (height - viewH / camZoom) / 2;
    updateBgStyle();
    return;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  for (const t of texts) {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    const approxW = t.text.length * t.size * 0.6;
    const approxH = t.size * 1.5;
    if (t.x + approxW > maxX) maxX = t.x + approxW;
    if (t.y + approxH > maxY) maxY = t.y + approxH;
  }

  for (const s of shapes) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }

  for (const img of images) {
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + img.width);
    maxY = Math.max(maxY, img.y + img.height);
  }

  const PAD = 40;
  const contentW = maxX - minX + PAD * 2;
  const contentH = maxY - minY + PAD * 2;

  camZoom = Math.min(viewW / contentW, viewH / contentH) * 0.9;
  camZoom = Math.max(0.05, Math.min(20, camZoom));

  camX = minX - PAD - (viewW / camZoom - contentW) / 2;
  camY = minY - PAD - (viewH / camZoom - contentH) / 2;

  updateBgStyle();
}

function fitCanvas() {
  if (!wrap.value || !baseEl.value) return;
  const rect = wrap.value.getBoundingClientRect();
  viewW = rect.width;
  viewH = rect.height;
  renderer.setViewport(viewW, viewH, dpr());
  fitContent();
  schedule();
}

let resizeObserver: ResizeObserver | undefined;

onMounted(async () => {
  const encoded = route.query.d;
  if (typeof encoded !== "string" || !encoded) {
    state.value = "error";
    errorMsg.value = "No snapshot data in URL.";
    return;
  }

  try {
    snapshot.value = await decodeSnapshot(encoded);
    state.value = "ready";
  } catch {
    state.value = "error";
    errorMsg.value = "Failed to decode snapshot. The link may be corrupted.";
    return;
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  if (!baseEl.value || !wrap.value) return;
  renderer.attach(baseEl.value);
  applyInkAdapter();
  // Decode any images into the renderer's bitmap cache before the first paint.
  await Promise.all((snapshot.value.images ?? []).map((img) => renderer.loadImage(img)));
  fitCanvas();
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
});

watch(isDark, () => {
  applyInkAdapter();
  schedule();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

let panX = 0;
let panY = 0;
let isPanning = false;

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  isPanning = true;
  panX = e.clientX;
  panY = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!isPanning) return;
  const dx = e.clientX - panX;
  const dy = e.clientY - panY;
  panX = e.clientX;
  panY = e.clientY;
  camX -= dx / camZoom;
  camY -= dy / camZoom;
  updateBgStyle();
  schedule();
}

function onPointerUp() {
  isPanning = false;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (e.ctrlKey) {
    const wx = camX + mx / camZoom;
    const wy = camY + my / camZoom;
    camZoom = Math.max(0.05, Math.min(20, camZoom * Math.exp(-e.deltaY * 0.001)));
    camX = wx - mx / camZoom;
    camY = wy - my / camZoom;
  } else {
    camX += e.deltaX / camZoom;
    camY += e.deltaY / camZoom;
  }
  updateBgStyle();
  schedule();
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* noop */
  }
}
</script>

<template>
  <div class="snapshot-view">
    <header class="bar" v-if="state === 'ready' || state === 'loading'">
      <div class="left">
        <button class="btn btn-ghost btn-icon" @click="router.push({ name: 'app' })" aria-label="Back to projects">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <span class="page-name">{{ snapshot?.name ?? '…' }}</span>
        <span class="badge">Snapshot</span>
      </div>
      <div class="right">
        <button class="btn btn-ghost" @click="copyLink" :disabled="state !== 'ready'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span class="btn-label">{{ copied ? 'Copied!' : 'Copy link' }}</span>
        </button>
      </div>
    </header>

    <main class="stage-wrap">
      <template v-if="state === 'ready' && snapshot">
        <div
          class="stage"
          ref="wrap"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
        >
          <div
            class="page-bg"
            :class="`bg-${snapshot.background}`"
            :style="pageBgStyle"
            aria-hidden="true"
          ></div>
          <canvas ref="baseEl" class="layer"></canvas>
        </div>
      </template>

      <div v-else-if="state === 'error'" class="center-state">
        <div class="error-card">
          <div class="state-title">Couldn't load snapshot</div>
          <div class="muted state-msg">{{ errorMsg }}</div>
          <button class="btn btn-primary" @click="router.push({ name: 'app' })">Back to projects</button>
        </div>
      </div>

      <div v-else class="center-state">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="muted">Loading snapshot…</div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.snapshot-view {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  padding-top: var(--safe-top);
}

.bar {
  height: var(--header-h);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-3);
  gap: var(--space-2);
  flex-shrink: 0;
}

.left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
}

.right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.page-name {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.03em;
  flex-shrink: 0;
  white-space: nowrap;
}

.stage-wrap {
  flex: 1;
  position: relative;
  min-height: 0;
}

.stage {
  position: absolute;
  inset: 0;
  background: var(--color-surface-2);
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}

.stage:active {
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
  pointer-events: none;
  background: transparent;
  forced-color-adjust: none;
}

.center-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.error-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  text-align: center;
  max-width: 380px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}

.state-title {
  font-size: var(--text-lg);
  font-weight: 600;
}

.state-msg {
  font-size: var(--text-sm);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-pill);
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 767px) {
  .bar {
    padding: 0 var(--space-2);
  }

  .btn-label {
    display: none;
  }
}
</style>
