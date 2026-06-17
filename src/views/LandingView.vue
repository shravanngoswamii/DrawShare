<script setup lang="ts">
import { getStroke } from "perfect-freehand";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useTheme } from "@/composables/useTheme";

const router = useRouter();
const { isDark, toggleTheme } = useTheme();

const joinCode = ref("");

function startDrawing() {
  router.push({ name: "app" });
}

function joinSession() {
  const code = joinCode.value.trim().toUpperCase();
  if (code.length < 4) return;
  router.push({ name: "viewer", params: { code } });
}

// ── Interactive canvas ───────────────────────────────────────────────────────

const DRAW_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#000000"];

const drawCanvas = ref<HTMLCanvasElement | null>(null);
const drawMode = ref(false);
const penColor = ref(DRAW_COLORS[0]);

type StrokeRecord = { pts: [number, number, number][]; color: string };
const committed = ref<StrokeRecord[]>([]);
let live: [number, number, number][] = [];
let painting = false;
let ctx: CanvasRenderingContext2D | null = null;
let rafId = 0;

const STROKE_OPTS = { size: 10, thinning: 0.55, smoothing: 0.5, streamline: 0.5 };

function strokePath(pts: [number, number, number][]): Path2D {
  const out = getStroke(pts, STROKE_OPTS);
  const p = new Path2D();
  if (!out.length) return p;
  p.moveTo(out[0][0], out[0][1]);
  for (let i = 1; i < out.length; i++) p.lineTo(out[i][0], out[i][1]);
  p.closePath();
  return p;
}

function renderCanvas() {
  const canvas = drawCanvas.value;
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of committed.value) {
    ctx.fillStyle = s.color;
    ctx.fill(strokePath(s.pts));
  }
  if (live.length > 1) {
    ctx.fillStyle = penColor.value;
    ctx.fill(strokePath(live));
  }
}

function scheduleRender() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(renderCanvas);
}

function resizeCanvas() {
  const canvas = drawCanvas.value;
  if (!canvas) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Preserve drawn content across resize by redrawing
  canvas.width = w;
  canvas.height = h;
  ctx = canvas.getContext("2d");
  renderCanvas();
}

function onPointerDown(e: PointerEvent) {
  if (!drawMode.value) return;
  e.preventDefault();
  painting = true;
  live = [[e.clientX, e.clientY, e.pressure || 0.5]];
  scheduleRender();
}

function onPointerMove(e: PointerEvent) {
  if (!drawMode.value || !painting) return;
  e.preventDefault();
  live.push([e.clientX, e.clientY, e.pressure || 0.5]);
  scheduleRender();
}

function onPointerUp(_e: PointerEvent) {
  if (!drawMode.value || !painting) return;
  painting = false;
  if (live.length > 1) {
    committed.value = [...committed.value, { pts: [...live], color: penColor.value }];
  }
  live = [];
  scheduleRender();
}

function clearCanvas() {
  committed.value = [];
  live = [];
  scheduleRender();
}

function toggleDrawMode() {
  drawMode.value = !drawMode.value;
}

function exitDrawMode() {
  if (!drawMode.value) return;
  painting = false;
  live = [];
  drawMode.value = false;
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") exitDrawMode();
}

onMounted(() => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("keydown", onKey);
  cancelAnimationFrame(rafId);
});
</script>

<template>
  <div class="landing">
    <!-- Nav -->
    <nav class="nav">
      <div class="nav-inner">
        <div class="brand">
          <svg class="brand-mark" width="28" height="28" viewBox="0 0 1024 1024" aria-hidden="true">
            <path d="M916.668 273.393l-66.711 66.711-168.533-168.532 66.712-66.712c52.639-52.639 132.855-57.328 179.24-10.942 23.311 23.309 33.783 55.149 31.698 87.511-1.802 32.647-16.207 65.765-42.406 91.964z" fill="#FF3B30"/>
            <path d="M762.348 163.22c-2.195 0-4.427-0.49-6.534-1.518-7.41-3.613-10.494-12.555-6.877-19.972 21.34-43.746 70.902-63.624 110.446-44.341 7.41 3.618 10.494 12.558 6.876 19.973-3.623 7.408-12.551 10.484-19.976 6.879-24.737-12.065-56.382 1.652-70.494 30.588-2.589 5.305-7.906 8.391-13.441 8.391z" fill="#FFFFFF"/>
            <path d="M143.188 708.155L697.96 155.654l168.981 168.981L304.964 883.58M161.098 920.034l-97.765 38.158 34.206-101.717z" fill="#152B3C"/>
            <path d="M240.709 708.755l-62.541 0.002-34.98-0.602-45.649 148.32 63.556 63.558 143.869-36.453 4.897-45.216 0.025-60.384-70.581 9.731z" fill="#FCB814"/>
            <path d="M861.579 62.897c7.356 4.411 14.285 9.667 20.559 15.942 23.308 23.308 33.781 55.149 31.695 87.509-1.8 32.649-16.206 65.764-42.405 91.965l-36.552 36.552 30.159 30.159 51.631-51.631c26.2-26.201 40.605-59.316 42.407-91.965 2.087-32.359-8.388-64.201-31.696-87.509-18.021-18.023-41.167-28.236-65.798-31.022z"/>
            <path d="M686.755 164.588l91.469 117.335c16.291 20.899 14.49 50.655-4.205 69.435L309.977 817.552l-5.013 66.028 561.977-558.945L697.96 155.654l-11.205 8.934z"/>
            <path d="M269.107 864.233l-129.423 34.388 21.411 21.412 143.869-36.453 4.897-45.216 0.025-60.384-15.239 2.101z"/>
            <path d="M317.969 621.444a14.888 14.888 0 0 1-10.561-4.375c-5.834-5.831-5.834-15.29 0-21.121L641.67 261.687c5.836-5.834 15.287-5.834 21.121 0 5.834 5.831 5.834 15.29 0 21.121L328.529 617.07a14.887 14.887 0 0 1-10.56 4.374z" fill="#FFFFFF"/>
          </svg>
          <span class="brand-name">DrawShare</span>
        </div>
        <div class="nav-links">
          <a href="https://github.com/shravanngoswamii/DrawShare" target="_blank" rel="noopener" class="nav-link" aria-label="GitHub repository">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </a>
          <button class="theme-btn" @click="toggleTheme" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
            <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </button>
          <button class="btn btn-primary start-nav-btn" @click="startDrawing">Open App</button>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-badge">Open source · Local-first · No account needed</div>
        <h1 class="hero-title">Write it.<br>Share it.<br><span class="accent">Live.</span></h1>
        <p class="hero-sub">
          DrawShare is a collaborative whiteboard that streams your drawing to any
          screen over your local network — instantly, privately, and offline-first.
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" @click="startDrawing">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
              <path d="m15 5 4 4"/>
            </svg>
            Start Drawing
          </button>
          <a href="https://github.com/shravanngoswamii/DrawShare" target="_blank" rel="noopener" class="btn btn-ghost btn-lg">
            View on GitHub
          </a>
        </div>

        <!-- Mock canvas preview -->
        <div class="canvas-preview" aria-hidden="true">
          <div class="preview-bar">
            <span class="preview-dot red"></span>
            <span class="preview-dot yellow"></span>
            <span class="preview-dot green"></span>
            <span class="preview-title">My Drawing</span>
          </div>
          <div class="preview-body">
            <svg class="preview-svg" viewBox="0 0 680 340" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Simulated ink strokes -->
              <path d="M 60 120 C 80 95 110 90 135 110 C 160 130 175 165 165 195 C 155 225 130 240 105 230 C 80 220 65 195 70 170 C 75 145 95 135 115 140" stroke="var(--color-accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
              <path d="M 200 90 L 200 220 M 200 90 C 230 80 255 90 260 115 C 265 140 245 160 200 155" stroke="var(--color-text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
              <path d="M 300 220 C 310 190 320 160 335 140 C 350 120 370 115 385 130 C 400 145 400 175 385 200 C 370 225 345 235 320 235 C 295 235 278 222 275 205" stroke="var(--color-text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
              <path d="M 440 90 C 430 140 425 190 430 240 M 440 90 C 460 85 478 95 482 115 C 486 135 472 150 448 152 M 448 152 C 468 155 490 165 495 188 C 500 211 486 230 462 235 C 445 238 430 235 430 240" stroke="var(--color-text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
              <!-- Highlight stroke -->
              <path d="M 55 175 Q 200 170 350 175 Q 500 180 625 170" stroke="#FFD60A" stroke-width="14" stroke-linecap="round" opacity="0.28"/>
              <!-- Cursor dot -->
              <circle cx="582" cy="200" r="6" fill="var(--color-accent)" opacity="0.85"/>
              <circle cx="582" cy="200" r="12" stroke="var(--color-accent)" stroke-width="1.5" opacity="0.3"/>
            </svg>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="features">
      <div class="features-inner">
        <h2 class="section-title">Everything you need, nothing you don't</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                <path d="m15 5 4 4"/>
              </svg>
            </div>
            <h3 class="feature-title">Freehand drawing</h3>
            <p class="feature-desc">Pressure-sensitive pens — ballpoint, brush and marker — plus shapes, text and drag-and-drop image import.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2 2 7l10 5 10-5-10-5z"/>
                <path d="m2 17 10 5 10-5"/>
                <path d="m2 12 10 5 10-5"/>
              </svg>
            </div>
            <h3 class="feature-title">Layers</h3>
            <p class="feature-desc">Stack your work in named layers — show/hide, lock, reorder and rename to keep sketches, ink and notes apart.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/>
                <line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <h3 class="feature-title">Live sharing</h3>
            <p class="feature-desc">Stream your strokes in real time to any device — share a short code, no account and no cloud in the middle.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <h3 class="feature-title">Read-only snapshot links</h3>
            <p class="feature-desc">Publish a page as a self-contained link. The whole snapshot lives in the URL — nothing is uploaded to a server.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <h3 class="feature-title">Present & teach</h3>
            <p class="feature-desc">Laser pointer, spotlight, step-by-step replay and an A4 notebook mode — built for classrooms and live demos.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <h3 class="feature-title">Offline & export</h3>
            <p class="feature-desc">Works fully offline as an installable PWA. Export pages to PNG or PDF, and back up everything as portable JSON.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="steps">
      <div class="steps-inner">
        <h2 class="section-title">From blank page to shared in seconds</h2>
        <ol class="steps-grid">
          <li class="step">
            <span class="step-num">1</span>
            <h3 class="step-title">Draw</h3>
            <p class="step-desc">Open the app and sketch on an infinite canvas or A4 notebook — pens, shapes, text and images, all stored on your device.</p>
          </li>
          <li class="step">
            <span class="step-num">2</span>
            <h3 class="step-title">Share a code</h3>
            <p class="step-desc">Start a live session and hand out the short code, or publish a read-only snapshot link that needs no server at all.</p>
          </li>
          <li class="step">
            <span class="step-num">3</span>
            <h3 class="step-title">They watch live</h3>
            <p class="step-desc">Viewers enter the code and your strokes appear on their screen in real time — point with the laser, spotlight a region, replay it later.</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- Join a session -->
    <section class="join-section">
      <div class="join-inner">
        <div class="join-text">
          <h2 class="section-title left">Join a live session</h2>
          <p class="join-sub">Got a code from the host? Enter it here to watch strokes appear live — no sign-in needed.</p>
        </div>
        <form class="join-form" @submit.prevent="joinSession">
          <input
            v-model="joinCode"
            class="input join-input"
            placeholder="Session code"
            maxlength="8"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            aria-label="Session code"
          />
          <button class="btn btn-primary" type="submit" :disabled="joinCode.trim().length < 4">
            Join
          </button>
        </form>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta-section">
      <div class="cta-inner">
        <h2 class="cta-title">Ready to start?</h2>
        <p class="cta-sub">Open the app and create your first canvas. No account. No setup. Just draw.</p>
        <button class="btn btn-primary btn-lg" @click="startDrawing">Start Drawing — it's free</button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <svg class="brand-mark" width="20" height="20" viewBox="0 0 1024 1024" aria-hidden="true">
            <path d="M916.668 273.393l-66.711 66.711-168.533-168.532 66.712-66.712c52.639-52.639 132.855-57.328 179.24-10.942 23.311 23.309 33.783 55.149 31.698 87.511-1.802 32.647-16.207 65.765-42.406 91.964z" fill="#FF3B30"/>
            <path d="M762.348 163.22c-2.195 0-4.427-0.49-6.534-1.518-7.41-3.613-10.494-12.555-6.877-19.972 21.34-43.746 70.902-63.624 110.446-44.341 7.41 3.618 10.494 12.558 6.876 19.973-3.623 7.408-12.551 10.484-19.976 6.879-24.737-12.065-56.382 1.652-70.494 30.588-2.589 5.305-7.906 8.391-13.441 8.391z" fill="#FFFFFF"/>
            <path d="M143.188 708.155L697.96 155.654l168.981 168.981L304.964 883.58M161.098 920.034l-97.765 38.158 34.206-101.717z" fill="#152B3C"/>
            <path d="M240.709 708.755l-62.541 0.002-34.98-0.602-45.649 148.32 63.556 63.558 143.869-36.453 4.897-45.216 0.025-60.384-70.581 9.731z" fill="#FCB814"/>
            <path d="M317.969 621.444a14.888 14.888 0 0 1-10.561-4.375c-5.834-5.831-5.834-15.29 0-21.121L641.67 261.687c5.836-5.834 15.287-5.834 21.121 0 5.834 5.831 5.834 15.29 0 21.121L328.529 617.07a14.887 14.887 0 0 1-10.56 4.374z" fill="#FFFFFF"/>
          </svg>
          <span>DrawShare</span>
        </div>
        <div class="footer-links">
          <a href="https://github.com/shravanngoswamii/DrawShare" target="_blank" rel="noopener" class="footer-link">GitHub</a>
          <a href="https://github.com/shravanngoswamii/DrawShare/issues" target="_blank" rel="noopener" class="footer-link">Issues</a>
          <a href="https://github.com/shravanngoswamii/DrawShare/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="footer-link">Contributing</a>
        </div>
        <div class="footer-copy muted">
          Open source · MIT License
        </div>
      </div>
    </footer>

    <!-- ── Interactive drawing layer ─────────────────────────────────────── -->
    <canvas
      ref="drawCanvas"
      class="draw-canvas"
      :class="{ 'draw-active': drawMode }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @touchstart.prevent
      @touchmove.prevent
      aria-hidden="true"
    />

    <!-- Color + clear toolbar (visible in draw mode) -->
    <transition name="palette-slide">
      <div v-if="drawMode" class="draw-palette" role="toolbar" aria-label="Drawing controls">
        <button
          v-for="c in DRAW_COLORS"
          :key="c"
          class="swatch"
          :class="{ active: penColor === c }"
          :style="{ '--c': c }"
          :aria-label="`Pick colour ${c}`"
          :aria-pressed="penColor === c"
          @click.stop="penColor = c"
        />
        <div class="palette-divider" />
        <button class="palette-btn" title="Clear canvas" aria-label="Clear drawing" @click.stop="clearCanvas">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </transition>

    <!-- Doodle-mode hint: makes the mode obvious and gives a one-tap exit, since
         the drawing layer covers the page and intercepts clicks while active. -->
    <transition name="hint-fade">
      <button v-if="drawMode" class="draw-hint" @click="exitDrawMode">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
          <path d="m15 5 4 4"/>
        </svg>
        <span>Doodle mode — tap here or press <kbd>Esc</kbd> to exit</span>
      </button>
    </transition>

    <!-- Draw FAB -->
    <button
      class="draw-fab"
      :class="{ 'draw-fab-active': drawMode }"
      :title="drawMode ? 'Exit doodle mode' : 'Doodle on this page'"
      :aria-label="drawMode ? 'Exit doodle mode' : 'Doodle on this page'"
      :aria-pressed="drawMode"
      @click="toggleDrawMode"
    >
      <!-- Pencil icon (browse mode) -->
      <svg v-if="!drawMode" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
        <path d="m15 5 4 4"/>
      </svg>
      <!-- Close icon (draw mode active) -->
      <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.landing {
  height: 100dvh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding-top: var(--safe-top);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

/* ── Nav ── */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.nav-inner {
  max-width: 1100px;
  margin: 0 auto;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 var(--space-6);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-name {
  font-weight: 700;
  font-size: var(--text-md);
  letter-spacing: -0.02em;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 120ms;
}

.nav-link:hover { color: var(--color-text); }

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: transparent;
  transition: background 100ms, color 100ms;
}

.theme-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.start-nav-btn { font-size: var(--text-sm); }

/* ── Hero ── */
.hero {
  flex-shrink: 0;
  padding: 80px var(--space-6) 64px;
  background: var(--color-bg);
}

.hero-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-6);
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  background: var(--color-accent-soft);
  border: 1px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-accent);
  letter-spacing: 0.02em;
}

.hero-title {
  font-size: clamp(2.6rem, 7vw, 5rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: var(--color-text);
  margin: 0;
}

.accent { color: var(--color-accent); }

.hero-sub {
  max-width: 560px;
  font-size: clamp(var(--text-md), 2vw, var(--text-lg));
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
}

.btn-lg {
  height: 48px;
  padding: 0 28px;
  font-size: var(--text-md);
  gap: var(--space-2);
  display: inline-flex;
  align-items: center;
}

/* ── Canvas preview ── */
.canvas-preview {
  width: 100%;
  max-width: 720px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: 0 24px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08);
  overflow: hidden;
  background: var(--color-bg);
}

.preview-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.preview-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.preview-dot.red    { background: #FF5F57; }
.preview-dot.yellow { background: #FFBD2E; }
.preview-dot.green  { background: #28C840; }

.preview-title {
  margin-left: auto;
  margin-right: auto;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.01em;
}

.preview-body {
  background: var(--color-canvas-surface, var(--color-bg));
  padding: var(--space-6) var(--space-8);
}

.preview-svg {
  width: 100%;
  height: auto;
  display: block;
}

/* ── Features ── */
.features {
  padding: 72px var(--space-6);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.features-inner {
  max-width: 1100px;
  margin: 0 auto;
}

.section-title {
  font-size: clamp(1.5rem, 3vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  text-align: center;
  margin: 0 0 var(--space-10);
}

.section-title.left { text-align: left; }

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
}

.feature-card {
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  /* Icon + title share row 1; description spans the full width below. */
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-3);
  transition: border-color 120ms, box-shadow 120ms;
}

.feature-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-md);
}

.feature-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feature-title {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}

.feature-desc {
  grid-column: 1 / -1;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.55;
  margin: 0;
}

/* ── How it works ── */
.steps {
  padding: 72px var(--space-6);
  background: var(--color-bg);
}

.steps-inner {
  max-width: 1100px;
  margin: 0 auto;
}

.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-8);
  list-style: none;
  margin: 0;
  padding: 0;
}

.step {
  /* Number + title share row 1; description spans the full width below. */
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-2);
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-text);
  font-weight: 700;
  font-size: var(--text-md);
  flex-shrink: 0;
}

.step-title {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}

.step-desc {
  grid-column: 1 / -1;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.55;
  margin: 0;
}

/* ── Join section ── */
.join-section {
  padding: 72px var(--space-6);
  border-top: 1px solid var(--color-border);
}

.join-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-10);
}

.join-text {
  flex: 1;
}

.join-sub {
  font-size: var(--text-md);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: var(--space-2) 0 0;
  max-width: 420px;
}

.join-form {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-shrink: 0;
}

.join-input {
  width: 200px;
  font-family: var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: var(--text-lg);
  height: 48px;
}

/* ── CTA ── */
.cta-section {
  padding: 80px var(--space-6);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.cta-inner {
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.cta-title {
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  margin: 0;
}

.cta-sub {
  font-size: var(--text-md);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
}

/* ── Footer ── */
.footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: var(--space-6);
  margin-top: auto;
}

.footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex-wrap: wrap;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  font-size: var(--text-sm);
}

.footer-links {
  display: flex;
  gap: var(--space-4);
  flex: 1;
}

.footer-link {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 100ms;
}

.footer-link:hover { color: var(--color-text); }

.footer-copy {
  font-size: var(--text-xs);
  margin-left: auto;
}

/* ── Responsive ── */
@media (max-width: 767px) {
  .hero { padding: 56px var(--space-4) 48px; }

  .nav-inner { padding: 0 var(--space-4); }
  .nav-link { display: none; }

  .features { padding: 48px var(--space-4); }
  .features-grid { grid-template-columns: 1fr; gap: var(--space-3); }

  .steps { padding: 48px var(--space-4); }
  .steps-grid { grid-template-columns: 1fr; gap: var(--space-6); }

  .join-section { padding: 48px var(--space-4); }
  .join-inner { flex-direction: column; align-items: flex-start; gap: var(--space-6); }
  .join-form { width: 100%; }
  .join-input { flex: 1; width: 0; }

  .cta-section { padding: 56px var(--space-4); }

  .footer-inner { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
  .footer-copy { margin-left: 0; }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
  .hero { padding: 64px var(--space-5) 56px; }
}

/* ── Interactive drawing layer ──────────────────────────────────────────── */
.draw-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 30;
  pointer-events: none;
  touch-action: none;
  cursor: default;
}

.draw-canvas.draw-active {
  pointer-events: all;
  cursor: crosshair;
}

/* FAB */
.draw-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 40;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-pill);
  background: var(--color-glass-bg-strong, var(--color-surface));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border, var(--color-border));
  box-shadow: 0 4px 20px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.1);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 140ms ease, box-shadow 140ms ease, background 100ms;
}

.draw-fab:hover {
  transform: scale(1.07);
  box-shadow: 0 6px 24px rgba(0,0,0,0.22);
}

.draw-fab:active { transform: scale(0.95); }

.draw-fab-active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

/* Doodle-mode hint — sits above the drawing layer and exits on tap */
.draw-hint {
  position: fixed;
  top: calc(var(--safe-top) + 14px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 41;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: calc(100% - 32px);
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-text);
  font-size: var(--text-sm);
  font-weight: 600;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.draw-hint kbd {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.22);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

/* Color palette toolbar */
.draw-palette {
  position: fixed;
  bottom: 88px;
  right: 16px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 999px;
  background: var(--color-glass-bg-strong, var(--color-surface));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-glass-border, var(--color-border));
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--c);
  border: 2px solid transparent;
  flex-shrink: 0;
  transition: transform 100ms, border-color 100ms;
}

.swatch:hover { transform: scale(1.15); }

.swatch.active {
  border-color: var(--color-text);
  transform: scale(1.2);
}

.palette-divider {
  width: 16px;
  height: 1px;
  background: var(--color-border);
  margin: 2px 0;
}

.palette-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: background 100ms, color 100ms;
}

.palette-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-danger, #ef4444);
}

/* Slide-in/out animation for the palette */
.palette-slide-enter-active { transition: opacity 180ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.palette-slide-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.palette-slide-enter-from  { opacity: 0; transform: translateY(10px) scale(0.9); }
.palette-slide-leave-to    { opacity: 0; transform: translateY(8px) scale(0.9); }
</style>
