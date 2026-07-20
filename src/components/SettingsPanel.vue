<script setup lang="ts">
import type { FeatureFlags } from "@/composables/useFeatures";
import { useFeatures } from "@/composables/useFeatures";
import { useEditorStore } from "@/stores/editor";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { flags, setFeature, resetFeatures } = useFeatures();
const editor = useEditorStore();

// Tools map 1:1 to an editor.tool value; if the active tool's feature gets
// turned off, fall back to pen so the canvas isn't left on a hidden tool.
const TOOL_FOR_FLAG: Partial<Record<keyof FeatureFlags, string>> = {
  highlighter: "highlighter",
  eraser: "eraser",
  fill: "fill",
  text: "text",
};

function toggle(key: keyof FeatureFlags) {
  const next = !flags[key];
  setFeature(key, next);
  if (!next && TOOL_FOR_FLAG[key] === editor.tool) editor.setTool("pen");
  if (!next && key === "shapes" && ["rect", "ellipse", "line", "arrow"].includes(editor.tool)) {
    editor.setTool("pen");
  }
}

interface FeatureRow {
  key: keyof FeatureFlags;
  label: string;
  description: string;
}
interface FeatureSection {
  title: string;
  rows: FeatureRow[];
}

const sections: FeatureSection[] = [
  {
    title: "Drawing tools",
    rows: [
      { key: "highlighter", label: "Highlighter", description: "Highlighter tool in the toolbar" },
      { key: "eraser", label: "Eraser", description: "Eraser tool, including whole/area modes" },
      { key: "fill", label: "Flood fill", description: "Fill an enclosed area with a colour" },
      { key: "shapes", label: "Shapes", description: "Rectangle, ellipse, line and arrow tools" },
      { key: "text", label: "Text", description: "Text tool" },
      {
        key: "imageImport",
        label: "Image import",
        description: "Import images via toolbar, paste or drag & drop",
      },
      {
        key: "presenterTools",
        label: "Presenter tools",
        description: "Laser pointer and spotlight for presenting",
      },
    ],
  },
  {
    title: "Panels",
    rows: [
      { key: "layers", label: "Layers", description: "Layer management in the pages panel" },
      {
        key: "background",
        label: "Background patterns",
        description: "Ruled, grid and dotted page backgrounds",
      },
    ],
  },
  {
    title: "Collaboration",
    rows: [
      {
        key: "liveShare",
        label: "Live share",
        description: "Start a live session so others can watch or draw along",
      },
    ],
  },
  {
    title: "Data",
    rows: [
      {
        key: "snapshotLink",
        label: "Snapshot link",
        description: "Share a static, one-way link to a single page",
      },
      {
        key: "replayRecording",
        label: "Record & replay",
        description: "Record a session so it can be replayed later",
      },
      {
        key: "backupRestore",
        label: "Backup & restore",
        description: "Export or import your projects as a JSON file",
      },
    ],
  },
  {
    title: "Help",
    rows: [
      {
        key: "onboarding",
        label: "Product tour",
        description: "Guided walkthrough for new users, and its replay button",
      },
      { key: "devMode", label: "Dev mode", description: "Developer debug overlay" },
    ],
  },
];
</script>

<template>
  <div v-if="open" class="settings-backdrop" aria-hidden="true" @click="emit('close')"></div>
  <div v-if="open" class="settings-panel" role="dialog" aria-label="Settings" aria-modal="true">
    <div class="settings-head">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span class="settings-title">Settings</span>
      <button class="settings-close" @click="emit('close')" aria-label="Close settings">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
        </svg>
      </button>
    </div>

    <div class="settings-body">
      <section v-for="section in sections" :key="section.title" class="settings-section">
        <h3 class="settings-section-title">{{ section.title }}</h3>
        <div v-for="row in section.rows" :key="row.key" class="feature-row">
          <div class="feature-text">
            <div class="feature-label">{{ row.label }}</div>
            <div class="feature-desc">{{ row.description }}</div>
          </div>
          <button
            class="switch"
            role="switch"
            :aria-checked="flags[row.key]"
            :aria-label="row.label"
            @click="toggle(row.key)"
          >
            <span class="switch-thumb"></span>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <button class="reset-btn" @click="resetFeatures">Reset to defaults</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: transparent;
}

.settings-panel {
  position: fixed;
  bottom: 64px;
  right: 12px;
  z-index: 91;
  width: 320px;
  max-height: min(560px, calc(100dvh - 80px));
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 14px;
  box-shadow: 0 12px 36px var(--color-glass-shadow), 0 2px 8px var(--color-glass-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: settings-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom left;
}

@media (prefers-color-scheme: dark) {
  .settings-panel {
    background: rgba(15, 23, 42, 0.68);
    border-color: rgba(148, 163, 184, 0.18);
  }
}
html[data-mode="dark"] .settings-panel {
  background: rgba(15, 23, 42, 0.68);
  border-color: rgba(148, 163, 184, 0.18);
}
html[data-mode="light"] .settings-panel {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(255, 255, 255, 0.55);
}

@keyframes settings-in {
  from { opacity: 0; transform: scale(0.94) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .settings-panel { animation: none; }
}

.settings-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border-radius: 14px 14px 0 0;
}

@media (prefers-color-scheme: dark) {
  .settings-head { background: rgba(15, 23, 42, 0.78); }
}
html[data-mode="dark"] .settings-head { background: rgba(15, 23, 42, 0.78); }
html[data-mode="light"] .settings-head { background: rgba(255, 255, 255, 0.72); }

.settings-title {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.settings-close:hover { background: var(--color-surface-2); color: var(--color-text); }

.settings-body {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  flex: 1;
}
.settings-body::-webkit-scrollbar { display: none; }

.settings-section {
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.settings-section:last-child { border-bottom: none; }

.settings-section-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-2);
}

.feature-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) 0;
}

.feature-text { flex: 1; min-width: 0; }

.feature-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text);
}

.feature-desc {
  font-size: 10px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.switch {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
  transition: background 120ms ease;
}
.switch[aria-checked="true"] {
  background: var(--color-accent);
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 120ms ease;
}
.switch[aria-checked="true"] .switch-thumb {
  transform: translateX(16px);
}

.reset-btn {
  width: 100%;
  padding: 7px var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.reset-btn:hover { background: var(--color-surface-2); color: var(--color-text); }

@media (max-width: 767px) {
  .settings-panel {
    right: 8px;
    bottom: calc(var(--safe-bottom, 0px) + 72px);
    width: calc(100vw - 16px);
    max-width: 360px;
    background: var(--color-glass-bg);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
  }
  html[data-mode="light"] .settings-panel,
  html[data-mode="dark"] .settings-panel {
    background: var(--color-glass-bg);
  }
  .settings-head,
  html[data-mode="light"] .settings-head,
  html[data-mode="dark"] .settings-head {
    background: var(--color-glass-bg-strong);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
