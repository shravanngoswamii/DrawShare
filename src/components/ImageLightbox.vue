<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ src: string }>();
const emit = defineEmits<{ close: [] }>();

const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const MIN = 1;
const MAX = 6;

function clampScale(s: number) {
  return Math.min(MAX, Math.max(MIN, s));
}

function reset() {
  scale.value = 1;
  tx.value = 0;
  ty.value = 0;
}

function zoomBy(factor: number) {
  scale.value = clampScale(scale.value * factor);
  if (scale.value === 1) {
    tx.value = 0;
    ty.value = 0;
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
}

function toggleZoom() {
  if (scale.value > 1) reset();
  else scale.value = 2.5;
}

// Pointer drag to pan (when zoomed) and pinch to zoom (two fingers).
const pointers = new Map<number, { x: number; y: number }>();
let pinchStartDist = 0;
let pinchStartScale = 1;

function onPointerDown(e: PointerEvent) {
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
    pinchStartScale = scale.value;
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId)!;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchStartDist > 0) scale.value = clampScale(pinchStartScale * (dist / pinchStartDist));
    return;
  }
  if (scale.value > 1) {
    tx.value += e.clientX - prev.x;
    ty.value += e.clientY - prev.y;
  }
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStartDist = 0;
  if (scale.value === 1) {
    tx.value = 0;
    ty.value = 0;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <div class="lb-backdrop" @click.self="emit('close')" role="dialog" aria-modal="true" aria-label="Image viewer">
    <div class="lb-tools">
      <button class="lb-btn" @click="zoomBy(1 / 1.4)" aria-label="Zoom out" v-tooltip="'Zoom out'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M8 11h6"/></svg>
      </button>
      <button class="lb-btn" @click="zoomBy(1.4)" aria-label="Zoom in" v-tooltip="'Zoom in'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>
      </button>
      <a class="lb-btn" :href="props.src" download="image" aria-label="Download" v-tooltip="'Download'" @click.stop>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
      </a>
      <button class="lb-btn" @click="emit('close')" aria-label="Close" v-tooltip="'Close'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <img
      class="lb-img"
      :src="props.src"
      alt="shared image"
      draggable="false"
      :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }"
      @wheel="onWheel"
      @dblclick="toggleZoom"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>

<style scoped>
.lb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  padding: calc(var(--space-4) + var(--safe-top)) var(--space-4)
    calc(var(--space-4) + var(--safe-bottom));
  touch-action: none;
  overscroll-behavior: contain;
  animation: lb-in 140ms ease;
}

@keyframes lb-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  will-change: transform;
}

.lb-tools {
  position: absolute;
  top: calc(var(--space-3) + var(--safe-top));
  right: calc(var(--space-3) + var(--safe-right));
  display: flex;
  gap: var(--space-2);
  z-index: 1;
}

.lb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border: none;
}
.lb-btn:hover {
  background: rgba(255, 255, 255, 0.22);
}
</style>
