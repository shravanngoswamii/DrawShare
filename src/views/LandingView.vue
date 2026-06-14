<script setup lang="ts">
import { ref } from "vue";
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
            <p class="feature-desc">Pressure-sensitive pen with ballpoint, brush, and marker styles. Shapes, text, and image import too.</p>
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
            <p class="feature-desc">Stream your strokes in real time to any device on your local network. No account, no cloud — just a code.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </div>
            <h3 class="feature-title">Works offline</h3>
            <p class="feature-desc">All your drawings live on your device — no internet required. Install as a PWA for the full app experience.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <h3 class="feature-title">Teaching & presenting</h3>
            <p class="feature-desc">Laser pointer, spotlight mode, session replay and notebook A4 mode — built for classrooms and presentations.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <h3 class="feature-title">Export anywhere</h3>
            <p class="feature-desc">Export pages as PNG. Back up and restore your entire project library as a portable JSON file.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3 class="feature-title">Session replay</h3>
            <p class="feature-desc">Play back how any page was drawn — point by point. Pause, seek, and control speed for step-by-step teaching.</p>
          </div>
        </div>
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
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
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
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.55;
  margin: 0;
}

/* ── Join section ── */
.join-section {
  padding: 72px var(--space-6);
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
</style>
