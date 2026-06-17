<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { useNarrationStore } from "@/stores/narration";
import type { ReplaySpeed } from "@/stores/replay";
import { useReplayStore } from "@/stores/replay";

const replay = useReplayStore();
const narration = useNarrationStore();

// ── RAF animation loop ──────────────────────────────────────────────────────

let rafId: number | null = null;
let lastTs = 0;

function startLoop() {
  lastTs = performance.now();
  function tick(ts: number) {
    if (!replay.playing) return;
    const dt = (ts - lastTs) * replay.speed;
    lastTs = ts;
    const next = replay.time + dt;
    if (next >= replay.duration) {
      replay.setTime(replay.duration);
      replay.setPlaying(false);
      return;
    }
    replay.setTime(next);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

watch(
  () => replay.playing,
  (v) => {
    if (v) {
      startLoop();
      narration.play(replay.time);
    } else {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      narration.pause();
    }
  },
);

watch(
  () => replay.speed,
  (v) => narration.setPlaybackRate(v),
);

watch(
  () => replay.active,
  (v) => {
    if (!v) {
      narration.pause();
      narration.seek(0);
    }
  },
);

onBeforeUnmount(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function togglePlay() {
  if (replay.time >= replay.duration) {
    replay.setTime(0);
  }
  replay.setPlaying(!replay.playing);
}

function onSeek(e: Event) {
  const t = +(e.target as HTMLInputElement).value;
  replay.setTime(t);
  narration.seek(t);
}

function setSpeed(v: ReplaySpeed) {
  replay.setSpeed(v);
}
</script>

<template>
  <div class="replay-panel" role="region" aria-label="Replay controls">
    <div class="replay-row">
      <!-- Play / Pause -->
      <button
        class="replay-play-btn"
        :aria-label="replay.playing ? 'Pause' : 'Play'"
        :title="replay.playing ? 'Pause' : 'Play'"
        @click="togglePlay"
      >
        <!-- Pause icon -->
        <svg v-if="replay.playing" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 19h4V5H6zm8-14v14h4V5z"/>
        </svg>
        <!-- Play icon -->
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>

      <!-- Time display -->
      <span class="replay-time" aria-live="off">
        {{ formatMs(replay.time) }}&thinsp;/&thinsp;{{ formatMs(replay.duration) }}
      </span>

      <!-- Speed buttons -->
      <div class="replay-speeds" role="group" aria-label="Playback speed">
        <button
          v-for="spd in ([0.5, 1, 2] as ReplaySpeed[])"
          :key="spd"
          class="replay-speed-btn"
          :class="{ active: replay.speed === spd }"
          :aria-pressed="replay.speed === spd"
          :title="`${spd}× speed`"
          @click="setSpeed(spd)"
        >{{ spd }}×</button>
      </div>

      <!-- Exit replay -->
      <button
        class="replay-exit-btn"
        title="Exit replay"
        aria-label="Exit replay"
        @click="replay.stop()"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Seek bar -->
    <div class="replay-seek-wrap">
      <input
        type="range"
        class="replay-seek"
        min="0"
        :max="replay.duration"
        step="1"
        :value="replay.time"
        aria-label="Seek"
        @input="onSeek"
      />
    </div>
  </div>
</template>

<style scoped>
.replay-panel {
  position: absolute;
  bottom: 56px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--color-glass-border);
  border-radius: 16px;
  box-shadow: var(--shadow-md), 0 2px 6px var(--color-glass-shadow);
  min-width: 320px;
  max-width: calc(100vw - 32px);
  pointer-events: all;
}

.replay-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Play / Pause button */
.replay-play-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-text, #fff);
  transition: transform 80ms ease, background 80ms ease;
}

.replay-play-btn:hover {
  transform: scale(1.06);
}

.replay-play-btn:active {
  transform: scale(0.94);
}

/* Time label */
.replay-time {
  font-size: var(--text-xs, 12px);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Speed buttons */
.replay-speeds {
  display: flex;
  gap: 3px;
  margin-left: auto;
}

.replay-speed-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  transition: background 80ms ease, color 80ms ease;
}

.replay-speed-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.replay-speed-btn.active {
  background: var(--color-accent);
  color: var(--color-accent-text, #fff);
}

/* Exit button */
.replay-exit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}

.replay-exit-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

/* Seek bar wrapper */
.replay-seek-wrap {
  padding: 0 2px;
}

.replay-seek {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--color-surface-2);
  cursor: pointer;
  accent-color: var(--color-accent);
  outline: none;
}

.replay-seek::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-accent);
  cursor: pointer;
  transition: transform 80ms ease;
}

.replay-seek::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.replay-seek::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 50%;
  background: var(--color-accent);
  cursor: pointer;
}

/* Responsive: on narrow screens, shrink min-width */
@media (max-width: 480px) {
  .replay-panel {
    min-width: 0;
    width: calc(100vw - 32px);
    bottom: 72px;
  }
}
</style>
