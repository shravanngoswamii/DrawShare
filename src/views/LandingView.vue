<script setup lang="ts">
import { getStroke } from "perfect-freehand";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
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

// ── Live transmission demo ───────────────────────────────────────────────────
// The hero is a tiny instance of the real product: ink drawn on the "you" canvas
// reappears on the "their screen" canvas a beat later, trailing a red live cursor.
// It self-draws a flourish on load, then you can draw on it yourself. One shared
// timeline of points drives both canvases; the viewer simply lags behind by a few
// points (viewerCount eases toward hostCount), which reads as live latency.

type InkPoint = { x: number; y: number; s: number; c?: string };
const PEN_COLORS = ["", "#2563eb", "#FF3B30", "#FCB814", "#10b981"]; // "" = theme ink

const hostCanvas = ref<HTMLCanvasElement | null>(null);
const viewerCanvas = ref<HTMLCanvasElement | null>(null);
const penColor = ref<string>(PEN_COLORS[0]);
const hasDrawn = ref(false); // hide the "draw here" hint after first interaction

let timeline: InkPoint[] = [];
let sceneLen = 0; // points belonging to the scripted intro
let nextStroke = 0;
let hostCount = 0;
let viewerCount = 0;
let introDone = false;
let painting = false;
let raf = 0;
let running = false;
const INTRO_SPEED = 1.7; // scene points revealed per frame
const VIEWER_EASE = 0.16;

let hostCtx: CanvasRenderingContext2D | null = null;
let viewerCtx: CanvasRenderingContext2D | null = null;
let hostW = 0;
let hostH = 0;
let viewerW = 0;
let viewerH = 0;

const reduceMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function inkColor() {
  return isDark.value ? "#EAEEF5" : "#14213D";
}

// Build the scripted intro: a confident underline flourish, then a small star —
// quick whiteboard marks that read unmistakably as live ink.
function buildScene(): InkPoint[][] {
  const flourish: InkPoint[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const x = 0.13 + 0.66 * t;
    let y = 0.56 + Math.sin(t * Math.PI * 2.1) * 0.12 * (0.35 + 0.65 * t);
    if (t > 0.82) y -= ((t - 0.82) / 0.18) * 0.24; // rising flick at the end
    flourish.push({ x, y, s: 0 });
  }
  const star: InkPoint[] = [];
  const cx = 0.8;
  const cy = 0.34;
  const r = 0.12;
  const order = [0, 2, 4, 1, 3, 0];
  for (let k = 0; k < order.length - 1; k++) {
    const a0 = -Math.PI / 2 + (order[k] * 2 * Math.PI) / 5;
    const a1 = -Math.PI / 2 + (order[k + 1] * 2 * Math.PI) / 5;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      star.push({
        x: cx + r * (Math.cos(a0) + (Math.cos(a1) - Math.cos(a0)) * t),
        y: (cy + r * (Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * t)) * 1.0,
        s: 1,
      });
    }
  }
  return [flourish, star];
}

function strokePath(pts: number[][], size: number, last: boolean): Path2D {
  const out = getStroke(pts, { size, thinning: 0.62, smoothing: 0.5, streamline: 0.5, last });
  const p = new Path2D();
  if (!out.length) return p;
  p.moveTo(out[0][0], out[0][1]);
  for (let i = 1; i < out.length; i++) p.lineTo(out[i][0], out[i][1]);
  p.closePath();
  return p;
}

// Paint the timeline up to `count` points; returns the leading [px,py] for the cursor.
function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
): [number, number] | null {
  ctx.clearRect(0, 0, w, h);
  const size = Math.max(3.5, w * 0.013);
  const n = Math.min(Math.floor(count), timeline.length);
  let i = 0;
  let lead: [number, number] | null = null;
  while (i < n) {
    const s = timeline[i].s;
    const col = timeline[i].c || inkColor();
    const pts: number[][] = [];
    let j = i;
    while (j < n && timeline[j].s === s) {
      pts.push([timeline[j].x * w, timeline[j].y * h]);
      j++;
    }
    const last = !(j === n && n < timeline.length && timeline[n]?.s === s);
    ctx.fillStyle = col;
    ctx.fill(strokePath(pts, size, last));
    if (pts.length) lead = pts[pts.length - 1] as [number, number];
    i = j;
  }
  return lead;
}

function drawCursor(ctx: CanvasRenderingContext2D, p: [number, number] | null) {
  if (!p) return;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
  ctx.fillStyle = "#FF3B30";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,59,48,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function renderBoth() {
  if (hostCtx) paint(hostCtx, hostW, hostH, hostCount);
  if (viewerCtx) {
    const lead = paint(viewerCtx, viewerW, viewerH, viewerCount);
    const behind = viewerCount < hostCount - 0.5 || painting || !introDone;
    if (behind) drawCursor(viewerCtx, lead);
  }
}

function frame() {
  if (!introDone) {
    hostCount += INTRO_SPEED;
    if (hostCount >= sceneLen) {
      hostCount = sceneLen;
      introDone = true;
    }
  } else {
    hostCount = timeline.length;
  }
  if (viewerCount < hostCount) {
    viewerCount = Math.min(
      hostCount,
      viewerCount + Math.max(1.2, (hostCount - viewerCount) * VIEWER_EASE),
    );
  }
  renderBoth();
  if (introDone && !painting && viewerCount >= hostCount) {
    running = false;
    return;
  }
  raf = requestAnimationFrame(frame);
}

function ensureLoop() {
  if (running) return;
  running = true;
  raf = requestAnimationFrame(frame);
}

function pointFromEvent(e: PointerEvent): { x: number; y: number } | null {
  const canvas = hostCanvas.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
}

function onHostDown(e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  const p = pointFromEvent(e);
  if (!p) return;
  hasDrawn.value = true;
  introDone = true; // skip remaining intro the moment the user takes over
  hostCount = timeline.length;
  painting = true;
  const s = nextStroke++;
  timeline.push({ x: p.x, y: p.y, s, c: penColor.value || undefined });
  hostCanvas.value?.setPointerCapture(e.pointerId);
  ensureLoop();
}

function onHostMove(e: PointerEvent) {
  if (!painting) return;
  const p = pointFromEvent(e);
  if (!p) return;
  const s = nextStroke - 1;
  timeline.push({ x: p.x, y: p.y, s, c: penColor.value || undefined });
}

function onHostUp() {
  painting = false;
  ensureLoop();
}

function clearDemo() {
  timeline = timeline.slice(0, sceneLen);
  nextStroke = 2;
  hostCount = sceneLen;
  viewerCount = sceneLen;
  introDone = true;
  renderBoth();
}

function sizeCanvas(canvas: HTMLCanvasElement): [CanvasRenderingContext2D | null, number, number] {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, rect.width, rect.height];
}

function fitCanvases() {
  if (hostCanvas.value) [hostCtx, hostW, hostH] = sizeCanvas(hostCanvas.value);
  if (viewerCanvas.value) [viewerCtx, viewerW, viewerH] = sizeCanvas(viewerCanvas.value);
  renderBoth();
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  const scene = buildScene();
  for (const stroke of scene) for (const pt of stroke) timeline.push(pt);
  sceneLen = timeline.length;
  nextStroke = scene.length;
  fitCanvases();
  if (reduceMotion) {
    hostCount = sceneLen;
    viewerCount = sceneLen;
    introDone = true;
    renderBoth();
  } else {
    ensureLoop();
  }
  resizeObserver = new ResizeObserver(() => fitCanvases());
  if (hostCanvas.value) resizeObserver.observe(hostCanvas.value);
  if (viewerCanvas.value) resizeObserver.observe(viewerCanvas.value);
});

// Intro ink uses the theme colour (graphite on paper, chalk on slate); repaint
// when the theme flips so committed strokes recolour.
watch(isDark, () => renderBoth());

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="landing">
    <!-- Nav -->
    <nav class="nav">
      <div class="nav-inner">
        <a class="brand" href="#top" aria-label="DrawShare home">
          <svg class="brand-mark" width="26" height="26" viewBox="0 0 1024 1024" aria-hidden="true">
            <path d="M916.668 273.393l-66.711 66.711-168.533-168.532 66.712-66.712c52.639-52.639 132.855-57.328 179.24-10.942 23.311 23.309 33.783 55.149 31.698 87.511-1.802 32.647-16.207 65.765-42.406 91.964z" fill="#FF3B30"/>
            <path d="M143.188 708.155L697.96 155.654l168.981 168.981L304.964 883.58M161.098 920.034l-97.765 38.158 34.206-101.717z" fill="#152B3C"/>
            <path d="M240.709 708.755l-62.541 0.002-34.98-0.602-45.649 148.32 63.556 63.558 143.869-36.453 4.897-45.216 0.025-60.384-70.581 9.731z" fill="#FCB814"/>
            <path d="M317.969 621.444a14.888 14.888 0 0 1-10.561-4.375c-5.834-5.831-5.834-15.29 0-21.121L641.67 261.687c5.836-5.834 15.287-5.834 21.121 0 5.834 5.831 5.834 15.29 0 21.121L328.529 617.07a14.887 14.887 0 0 1-10.56 4.374z" fill="#FFFFFF"/>
          </svg>
          <span class="brand-name h-display">DrawShare</span>
        </a>
        <div class="nav-links">
          <a href="https://github.com/shravanngoswamii/DrawShare" target="_blank" rel="noopener" class="nav-link mono" aria-label="GitHub repository">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
          <button class="btn btn-primary nav-cta" @click="startDrawing">Open app</button>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <header id="top" class="hero paper-grid">
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow mono">Local-first whiteboard</p>
          <h1 class="hero-title h-display">
            Write here. It's on
            <span class="mark">their screen</span>
            before you finish.
          </h1>
          <p class="hero-sub">
            Share a six-character code. Your ink appears on any device on your network,
            live — no account, no cloud, nothing leaves the room.
          </p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" @click="startDrawing">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                <path d="m15 5 4 4"/>
              </svg>
              Start drawing
            </button>
            <a href="https://github.com/shravanngoswamii/DrawShare" target="_blank" rel="noopener" class="btn btn-ghost btn-lg">View on GitHub</a>
          </div>
          <p class="hero-meta mono">no account · works offline · open source</p>
        </div>

        <!-- Signature: live host → viewer ink mirror -->
        <div class="demo" aria-hidden="true">
          <figure class="screen">
            <figcaption class="screen-head">
              <span class="screen-dot"></span> You
            </figcaption>
            <div class="screen-body">
              <canvas
                ref="hostCanvas"
                class="ink-canvas"
                @pointerdown="onHostDown"
                @pointermove="onHostMove"
                @pointerup="onHostUp"
                @pointerleave="onHostUp"
                @touchstart.prevent
                @touchmove.prevent
              ></canvas>
              <transition name="fade">
                <span v-if="!hasDrawn" class="draw-hint mono">draw here ✍</span>
              </transition>
            </div>
          </figure>

          <div class="link">
            <span class="code-chip mono">K7M2QX</span>
            <svg class="link-arrow" width="40" height="16" viewBox="0 0 40 16" fill="none" aria-hidden="true">
              <path d="M1 8h34" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"/>
              <path d="M31 3l6 5-6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <figure class="screen viewer">
            <figcaption class="screen-head">
              <span class="screen-dot live"></span> Their screen
            </figcaption>
            <div class="screen-body">
              <canvas ref="viewerCanvas" class="ink-canvas"></canvas>
            </div>
          </figure>
        </div>
        <div class="demo-controls" aria-hidden="true">
          <div class="pens">
            <button
              v-for="c in PEN_COLORS"
              :key="c || 'ink'"
              class="pen"
              :class="{ active: penColor === c }"
              :style="{ '--pen': c || 'var(--ink-swatch)' }"
              :aria-label="c ? `Pen colour ${c}` : 'Ink pen'"
              @click="penColor = c"
            ></button>
          </div>
          <button class="reset mono" @click="clearDemo">Clear</button>
        </div>
      </div>
    </header>

    <!-- How it works -->
    <section class="steps">
      <div class="shell">
        <h2 class="section-title h-display">Blank page to shared in seconds</h2>
        <ol class="steps-row">
          <li class="step">
            <span class="step-num mono">1</span>
            <h3 class="step-title h-display">Draw</h3>
            <p class="step-desc">Open a canvas or an A4 notebook and write — pens, shapes, text, images, layers.</p>
          </li>
          <li class="step">
            <span class="step-num mono">2</span>
            <h3 class="step-title h-display">Share a code</h3>
            <p class="step-desc">Start a session and read out six characters, or publish a read-only snapshot link.</p>
          </li>
          <li class="step">
            <span class="step-num mono">3</span>
            <h3 class="step-title h-display">They watch live</h3>
            <p class="step-desc">Viewers type the code and your strokes appear as you make them. Point, spotlight, replay.</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- Features -->
    <section class="features paper-grid">
      <div class="shell">
        <h2 class="section-title h-display">Everything the room needs</h2>
        <div class="feat-grid">
          <article class="feat">
            <div class="feat-head">
              <span class="feat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>
                </svg>
              </span>
              <h3 class="feat-title h-display">Freehand drawing</h3>
            </div>
            <p class="feat-desc">Pressure-sensitive pens — ballpoint, brush, marker — plus shapes, text and image import.</p>
          </article>
          <article class="feat">
            <div class="feat-head">
              <span class="feat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>
                </svg>
              </span>
              <h3 class="feat-title h-display">Layers</h3>
            </div>
            <p class="feat-desc">Stack work in named layers — show/hide, lock, reorder. Keep sketches, ink and notes apart.</p>
          </article>
          <article class="feat">
            <div class="feat-head">
              <span class="feat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
                </svg>
              </span>
              <h3 class="feat-title h-display">Live sharing</h3>
            </div>
            <p class="feat-desc">Stream strokes in real time to any device — a short code, no account, no cloud between you.</p>
          </article>
          <article class="feat">
            <div class="feat-head">
              <span class="feat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </span>
              <h3 class="feat-title h-display">Snapshot links</h3>
            </div>
            <p class="feat-desc">Publish a page as a self-contained link. The whole snapshot rides in the URL — never uploaded.</p>
          </article>
          <article class="feat">
            <div class="feat-head">
              <span class="feat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </span>
              <h3 class="feat-title h-display">Present &amp; teach</h3>
            </div>
            <p class="feat-desc">Laser pointer, spotlight, step-by-step replay and an A4 notebook mode for classes and demos.</p>
          </article>
          <article class="feat">
            <div class="feat-head">
              <span class="feat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </span>
              <h3 class="feat-title h-display">Offline &amp; export</h3>
            </div>
            <p class="feat-desc">Runs fully offline as a PWA. Export pages to PNG or PDF, back everything up as portable JSON.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- Join -->
    <section class="join">
      <div class="shell join-inner">
        <div>
          <h2 class="section-title left h-display">Got a code?</h2>
          <p class="join-sub">Drop in to watch a session live — no sign-in, nothing to install.</p>
        </div>
        <form class="join-form" @submit.prevent="joinSession">
          <input
            v-model="joinCode"
            class="input join-input mono"
            placeholder="CODE"
            maxlength="8"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            aria-label="Session code"
          />
          <button class="btn btn-primary" type="submit" :disabled="joinCode.trim().length < 4">Join</button>
        </form>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta paper-grid">
      <div class="cta-inner">
        <h2 class="cta-title h-display">Put a pen on every screen.</h2>
        <p class="cta-sub">Open the app and make your first canvas. No account, no setup — just draw.</p>
        <button class="btn btn-primary btn-lg" @click="startDrawing">Start drawing</button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="shell footer-inner">
        <span class="footer-brand mono">DrawShare</span>
        <div class="footer-links">
          <a href="https://github.com/shravanngoswamii/DrawShare" target="_blank" rel="noopener" class="footer-link">GitHub</a>
          <a href="https://github.com/shravanngoswamii/DrawShare/issues" target="_blank" rel="noopener" class="footer-link">Issues</a>
          <a href="https://github.com/shravanngoswamii/DrawShare/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener" class="footer-link">Contributing</a>
        </div>
        <span class="footer-copy mono">MIT · local-first</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  --ink-swatch: #14213d;
  --pencil: #fcb814;
  --eraser: #ff3b30;
  height: 100dvh;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-top: var(--safe-top);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
}
:global([data-theme="dark"]) .landing {
  --ink-swatch: #eaeef5;
}

.h-display {
  font-family: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.025em;
}
.mono {
  font-family: "Space Mono", ui-monospace, "SFMono-Regular", monospace;
}

.shell {
  max-width: 1080px;
  margin: 0 auto;
}

/* Dotted-paper texture, straight from the app's canvas backgrounds */
.paper-grid {
  background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
  background-size: 22px 22px;
}

/* ── Nav ── */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 82%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.nav-inner {
  max-width: 1080px;
  margin: 0 auto;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: var(--color-text);
}
.brand-name {
  font-weight: 700;
  font-size: var(--text-md);
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
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 120ms;
}
.nav-link:hover {
  color: var(--color-text);
}
.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: background 100ms, color 100ms;
}
.theme-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.nav-cta {
  font-size: var(--text-sm);
}

/* ── Hero ── */
.hero {
  padding: clamp(48px, 8vw, 96px) var(--space-6) clamp(56px, 9vw, 104px);
  border-bottom: 1px solid var(--color-border);
}
.hero-inner {
  max-width: 1080px;
  margin: 0 auto;
  /* Stacked: copy on top, the live demo full-width below so the two screens are
     large. (Was a 2-column split that squeezed the canvases.) */
  display: flex;
  flex-direction: column;
  gap: clamp(var(--space-8), 5vw, 56px);
}
.hero-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: center;
  text-align: center;
  gap: var(--space-5);
  max-width: 46rem;
}
.eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--color-accent);
  margin: 0;
}
.hero-title {
  font-size: clamp(2.3rem, 5.4vw, 4rem);
  font-weight: 800;
  line-height: 1.04;
  margin: 0;
}
/* Highlighter swipe under "their screen" — the pencil-yellow accent */
.mark {
  background: linear-gradient(
    180deg,
    transparent 58%,
    color-mix(in srgb, var(--pencil) 60%, transparent) 58%
  );
  padding: 0 2px;
}
.hero-sub {
  max-width: 32rem;
  font-size: clamp(var(--text-md), 1.6vw, var(--text-lg));
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
}
.hero-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.btn-lg {
  height: 48px;
  padding: 0 26px;
  font-size: var(--text-md);
  gap: var(--space-2);
  display: inline-flex;
  align-items: center;
}
.hero-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  margin: 0;
}

/* ── Live demo ── */
.demo {
  width: 100%;
  display: flex;
  align-items: center;
  gap: clamp(var(--space-3), 2vw, var(--space-5));
}
.screen {
  flex: 1;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-border-strong, var(--color-border));
  border-radius: var(--radius-lg);
  background: var(--color-canvas-surface, var(--color-surface));
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.14), 0 3px 10px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.screen.viewer {
  transform: rotate(1.4deg);
}
.screen-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.screen-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}
.screen-dot.live {
  background: var(--eraser);
  box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.5);
  animation: live-pulse 1.6s ease-out infinite;
}
@keyframes live-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.5);
  }
  100% {
    box-shadow: 0 0 0 7px rgba(255, 59, 48, 0);
  }
}
.screen-body {
  position: relative;
}
.ink-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  touch-action: none;
}
.screen:not(.viewer) .ink-canvas {
  cursor: crosshair;
}
.draw-hint {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  opacity: 0.7;
  pointer-events: none;
  white-space: nowrap;
}
.link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.code-chip {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.demo-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  margin-top: calc(-1 * var(--space-2));
}
.pens {
  display: flex;
  gap: 8px;
}
.pen {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--pen);
  border: 2px solid var(--color-border);
  transition: transform 100ms, border-color 100ms;
}
.pen:hover {
  transform: scale(1.12);
}
.pen.active {
  border-color: var(--color-text);
  transform: scale(1.18);
}
.reset {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}
.reset:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

/* ── Shared section title ── */
.section-title {
  font-size: clamp(1.6rem, 3.2vw, 2.4rem);
  font-weight: 700;
  text-align: center;
  margin: 0 0 var(--space-10);
}
.section-title.left {
  text-align: left;
  margin-bottom: var(--space-2);
}

/* ── Steps ── */
.steps {
  padding: clamp(56px, 8vw, 88px) var(--space-6);
}
.steps-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(var(--space-6), 4vw, 56px);
  list-style: none;
  margin: 0;
  padding: 0;
}
.step {
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
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--color-bg);
  font-weight: 700;
  font-size: var(--text-sm);
  flex-shrink: 0;
}
.step-title {
  font-size: var(--text-lg);
  font-weight: 700;
  margin: 0;
}
.step-desc {
  grid-column: 1 / -1;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.55;
  margin: 0;
}

/* ── Features ── */
.features {
  padding: clamp(56px, 8vw, 88px) var(--space-6);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
.feat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}
.feat {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  transition: border-color 120ms, box-shadow 120ms, transform 120ms;
}
.feat:hover {
  border-color: var(--color-border-strong, var(--color-border));
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.feat-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.feat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  flex-shrink: 0;
}
.feat-title {
  font-size: var(--text-md);
  font-weight: 700;
  margin: 0;
}
.feat-desc {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.55;
  margin: 0;
}

/* ── Join ── */
.join {
  padding: clamp(48px, 7vw, 80px) var(--space-6);
}
.join-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
}
.join-sub {
  font-size: var(--text-md);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
  max-width: 26rem;
}
.join-form {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}
.join-input {
  width: 180px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: var(--text-lg);
  height: 48px;
}

/* ── CTA ── */
.cta {
  padding: clamp(64px, 9vw, 104px) var(--space-6);
  border-top: 1px solid var(--color-border);
}
.cta-inner {
  max-width: 40rem;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}
.cta-title {
  font-size: clamp(1.9rem, 4.4vw, 3rem);
  font-weight: 800;
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
}
.footer-inner {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.footer-brand {
  font-weight: 700;
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
.footer-link:hover {
  color: var(--color-text);
}
.footer-copy {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-left: auto;
}

/* ── Responsive ── */
@media (max-width: 767px) {
  .nav-inner {
    padding: 0 var(--space-4);
  }
  .nav-link {
    display: none;
  }
  .hero {
    padding: 40px var(--space-4) 56px;
  }
  .demo {
    flex-direction: column;
  }
  .link {
    flex-direction: row;
  }
  .link-arrow {
    transform: rotate(90deg);
  }
  .screen.viewer {
    transform: none;
  }
  .steps,
  .features,
  .join,
  .cta {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .steps-row {
    grid-template-columns: 1fr;
  }
  .feat-grid {
    grid-template-columns: 1fr;
  }
  .join-inner {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-5);
  }
  .join-form {
    width: 100%;
  }
  .join-input {
    flex: 1;
    width: 0;
  }
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .footer-copy {
    margin-left: 0;
  }
}
@media (min-width: 768px) and (max-width: 1023px) {
  .feat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .screen-dot.live {
    animation: none;
  }
  .feat:hover {
    transform: none;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
