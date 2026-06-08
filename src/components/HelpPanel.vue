<script setup lang="ts">
import { devMode, setDevMode } from "@/debug";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const GITHUB_URL = "https://github.com/shravanngoswamii/DrawShare";

const shortcuts = [
  { keys: ["1"], action: "Pen tool" },
  { keys: ["2"], action: "Highlighter" },
  { keys: ["3"], action: "Eraser" },
  { keys: ["Ctrl", "Z"], action: "Undo" },
  { keys: ["Ctrl", "⇧", "Z"], action: "Redo" },
  { keys: ["Space", "drag"], action: "Pan canvas" },
  { keys: ["Ctrl", "scroll"], action: "Zoom" },
  { keys: ["Pinch"], action: "Zoom (touch)" },
  { keys: ["Esc"], action: "Close overlay / text" },
];

const faqs = [
  {
    q: "Does DrawShare work offline?",
    a: "Yes — all data lives in your browser (IndexedDB). Install it as a PWA and it loads and runs fully offline.",
  },
  {
    q: "Where is my data stored?",
    a: "Entirely on your device. Nothing leaves your browser unless you start a live session.",
  },
  {
    q: "How does live sharing work?",
    a: "The host broadcasts strokes over WebRTC. Viewers join with a 4-character code — no account or server needed.",
  },
  {
    q: "How do I export my work?",
    a: "Open the Pages panel → Export PNG for the current page. Use Projects → Backup to save everything as a JSON file.",
  },
];
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="help-backdrop" @click="emit('close')" aria-hidden="true"></div>
    <div v-if="open" class="help-panel" role="dialog" aria-label="Help" aria-modal="true">
      <div class="help-head">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
        </svg>
        <span class="help-title">Help</span>
        <button class="help-close" @click="emit('close')" aria-label="Close help">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>

      <div class="help-body">
        <!-- About -->
        <section class="help-section">
          <p class="about-desc">Local-first collaborative whiteboard — draw on any device, share live on your network.</p>
          <div class="about-links">
            <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer" class="gh-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .267.18.578.688.48C19.137 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              View on GitHub
            </a>
            <span class="version-badge">v0.1.0 · MIT</span>
          </div>
        </section>

        <!-- Keyboard shortcuts -->
        <section class="help-section">
          <h3 class="help-section-title">Keyboard shortcuts</h3>
          <div class="shortcuts-grid">
            <template v-for="s in shortcuts" :key="s.action">
              <div class="shortcut-keys">
                <kbd v-for="k in s.keys" :key="k">{{ k }}</kbd>
              </div>
              <div class="shortcut-action">{{ s.action }}</div>
            </template>
          </div>
        </section>

        <!-- FAQ -->
        <section class="help-section">
          <h3 class="help-section-title">FAQ</h3>
          <div class="faq-list">
            <details v-for="f in faqs" :key="f.q" class="faq-item">
              <summary class="faq-q">{{ f.q }}</summary>
              <p class="faq-a">{{ f.a }}</p>
            </details>
          </div>
        </section>

        <!-- Dev mode & credit -->
        <section class="help-section help-foot">
          <button
            class="dev-toggle"
            :class="{ active: devMode }"
            @click="setDevMode(!devMode)"
            :aria-pressed="devMode"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
              <path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/><path d="M13.5 7.5 10 17"/>
            </svg>
            Dev mode
            <span class="dev-status">{{ devMode ? 'on' : 'off' }}</span>
          </button>
          <span class="foot-credit">by <a href="https://github.com/shravanngoswamii" target="_blank" rel="noopener noreferrer">Shravan Goswami</a></span>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: transparent;
}

.help-panel {
  position: fixed;
  bottom: 64px;
  right: 12px;
  z-index: 91;
  width: 300px;
  max-height: min(520px, calc(100dvh - 80px));
  background: var(--color-glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-glass-border);
  border-radius: 14px;
  box-shadow: 0 12px 36px var(--color-glass-shadow), 0 2px 8px var(--color-glass-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: help-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom left;
}

@keyframes help-in {
  from { opacity: 0; transform: scale(0.94) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .help-panel { animation: none; }
}

.help-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  position: sticky;
  top: 0;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 14px 14px 0 0;
}

.help-title {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.help-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.help-close:hover { background: var(--color-surface-2); color: var(--color-text); }

.help-body {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  flex: 1;
}

.help-section {
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.help-section:last-child { border-bottom: none; }

.about-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0 0 var(--space-2);
}

.about-links {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.gh-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-accent);
  text-decoration: none;
}
.gh-link:hover { text-decoration: underline; }

.version-badge {
  font-size: 10px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.help-section-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-2);
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-3);
  align-items: center;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 5px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: var(--color-surface-2);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.4;
}

.shortcut-action {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.faq-item {
  border-radius: var(--radius-md);
  overflow: hidden;
}

.faq-q {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  transition: background 80ms ease;
}
.faq-q::before {
  content: "›";
  font-size: 14px;
  color: var(--color-text-muted);
  transition: transform 120ms ease;
}
details[open] .faq-q::before { transform: rotate(90deg); }
.faq-q::-webkit-details-marker { display: none; }
.faq-q:hover { background: var(--color-surface-2); }

.faq-a {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.5;
  padding: var(--space-1) var(--space-2) var(--space-2) calc(var(--space-2) + 14px);
  margin: 0;
}

.help-foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.dev-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.dev-toggle:hover { background: var(--color-surface-2); color: var(--color-text); }
.dev-toggle.active {
  background: var(--color-success-soft);
  border-color: var(--color-success);
  color: var(--color-success-strong);
}

.dev-status {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  padding-top: 1px;
}

.foot-credit {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-left: auto;
}
.foot-credit a {
  color: var(--color-accent);
  text-decoration: none;
}
.foot-credit a:hover { text-decoration: underline; }

@media (max-width: 767px) {
  .help-panel {
    right: 8px;
    bottom: 72px;
    width: calc(100vw - 16px);
    max-width: 340px;
  }
}
</style>
