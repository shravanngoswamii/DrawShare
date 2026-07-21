<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { FeatureFlags } from "@/composables/useFeatures";
import { useFeatures } from "@/composables/useFeatures";
import { useTheme } from "@/composables/useTheme";
import { useEditorStore } from "@/stores/editor";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) window.addEventListener("keydown", onKeydown);
    else window.removeEventListener("keydown", onKeydown);
  },
);
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

const { flags, setFeature, resetFeatures } = useFeatures();
const editor = useEditorStore();
const { themes, defaultLightId, defaultDarkId, setDefaultLight, setDefaultDark } = useTheme();

const lightThemes = computed(() => themes.filter((t) => t.mode === "light"));
const darkThemes = computed(() => themes.filter((t) => t.mode === "dark"));

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
interface Category {
  id: string;
  title: string;
  rows: FeatureRow[];
}

const categories: Category[] = [
  {
    id: "appearance",
    title: "Appearance",
    rows: [
      {
        key: "themeChoices",
        label: "Multiple theme choices",
        description:
          "Pick from every colour family and signature theme. Turn off to reduce the theme button to a plain light/dark switch.",
      },
    ],
  },
  {
    id: "drawing",
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
    id: "interface",
    title: "Interface",
    rows: [
      {
        key: "backButton",
        label: "Back button",
        description: "Top-left button to leave the editor and return to projects",
      },
      {
        key: "zoomControls",
        label: "Zoom controls",
        description: "Bottom-left zoom in/out buttons (Ctrl+scroll and pinch still work)",
      },
    ],
  },
  {
    id: "panels",
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
    id: "collaboration",
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
    id: "data",
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
    id: "help",
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

const activeId = ref(categories[0].id);
const active = () => categories.find((c) => c.id === activeId.value) ?? categories[0];
</script>

<template>
  <div v-if="open" class="settings-backdrop" @click.self="emit('close')">
    <div class="settings-modal" role="dialog" aria-label="Settings" aria-modal="true">
      <header class="settings-head">
        <h2 class="settings-title">Settings</h2>
        <button class="settings-close" @click="emit('close')" aria-label="Close settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      <div class="settings-body">
        <nav class="settings-nav" aria-label="Settings categories">
          <button
            v-for="c in categories"
            :key="c.id"
            class="nav-item"
            :class="{ active: activeId === c.id }"
            :aria-current="activeId === c.id ? 'true' : undefined"
            @click="activeId = c.id"
          >
            {{ c.title }}
          </button>
        </nav>

        <div class="settings-content">
          <h3 class="content-title">{{ active().title }}</h3>
          <div v-for="row in active().rows" :key="row.key" class="feature-row">
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

          <div v-if="activeId === 'appearance' && !flags.themeChoices" class="default-theme-pickers">
            <div class="default-theme-group">
              <div class="default-theme-label">Default light theme</div>
              <div class="theme-grid" role="radiogroup" aria-label="Default light theme">
                <button
                  v-for="t in lightThemes"
                  :key="t.id"
                  class="theme-tile"
                  :class="{ active: defaultLightId === t.id }"
                  role="radio"
                  :aria-checked="defaultLightId === t.id"
                  @click="setDefaultLight(t.id)"
                >
                  <span class="theme-prev" :style="{ background: t.bg }" aria-hidden="true">
                    <span class="theme-prev-card" :style="{ background: t.surface }">
                      <span class="theme-prev-bar" :style="{ background: t.swatch }"></span>
                      <span class="theme-prev-line" :style="{ background: t.text }"></span>
                      <span class="theme-prev-line theme-prev-line-short" :style="{ background: t.text }"></span>
                    </span>
                  </span>
                  <span class="theme-tile-row">
                    <span class="theme-tile-name">{{ t.name }}</span>
                    <svg v-if="defaultLightId === t.id" class="theme-tile-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                </button>
              </div>
            </div>
            <div class="default-theme-group">
              <div class="default-theme-label">Default dark theme</div>
              <div class="theme-grid" role="radiogroup" aria-label="Default dark theme">
                <button
                  v-for="t in darkThemes"
                  :key="t.id"
                  class="theme-tile"
                  :class="{ active: defaultDarkId === t.id }"
                  role="radio"
                  :aria-checked="defaultDarkId === t.id"
                  @click="setDefaultDark(t.id)"
                >
                  <span class="theme-prev" :style="{ background: t.bg }" aria-hidden="true">
                    <span class="theme-prev-card" :style="{ background: t.surface }">
                      <span class="theme-prev-bar" :style="{ background: t.swatch }"></span>
                      <span class="theme-prev-line" :style="{ background: t.text }"></span>
                      <span class="theme-prev-line theme-prev-line-short" :style="{ background: t.text }"></span>
                    </span>
                  </span>
                  <span class="theme-tile-row">
                    <span class="theme-tile-name">{{ t.name }}</span>
                    <svg v-if="defaultDarkId === t.id" class="theme-tile-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="settings-foot">
        <button class="reset-btn" @click="resetFeatures">Reset to defaults</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* Class names in this component are all prefixed with "settings-" (rather
   than the generic .backdrop/.modal/.head used elsewhere) because Vue stamps
   a parent's scoped-style attribute onto a child component's root element —
   when this modal is mounted from inside PagesPanel.vue, a generic root
   class name here would collide with PagesPanel's own same-named rule (it
   has its own unrelated .backdrop for its mobile drawer) and get hidden by
   it silently. */
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--space-4);
  padding-bottom: calc(var(--space-4) + var(--safe-bottom));
  animation: fadeIn 160ms ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-modal {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  width: min(640px, 100%);
  max-height: min(560px, calc(100vh - var(--space-8)));
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  animation: slideUp 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.settings-title {
  font-size: var(--text-md);
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  width: 30px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.settings-close:hover { background: var(--color-surface-2); color: var(--color-text); }

.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.settings-nav {
  flex-shrink: 0;
  width: 180px;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.nav-item {
  text-align: left;
  padding: 8px var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.nav-item:hover { background: var(--color-surface-2); color: var(--color-text); }
.nav-item.active { background: var(--color-accent-soft); color: var(--color-accent); }

.settings-content {
  flex: 1;
  min-width: 0;
  padding: var(--space-4) var(--space-5);
  overflow-y: auto;
}

.content-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-3);
}

.feature-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.feature-row:last-child { border-bottom: none; }

.feature-text { flex: 1; min-width: 0; }

.feature-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}

.feature-desc {
  font-size: var(--text-xs);
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

.default-theme-pickers {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding-top: var(--space-3);
}

.default-theme-label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--space-2);
}

.theme-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background 80ms ease;
}
.theme-tile:hover {
  background: var(--color-surface-2);
}

/* Mini theme sample: a "page" (bg) holding a surface card with an accent pill
   and two ink lines — a real glance of the palette, matching ThemeMenu's grid. */
.theme-prev {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  padding: 7px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-xs);
  transition: box-shadow 80ms ease, transform 80ms ease;
}
.theme-tile:hover .theme-prev {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.theme-tile.active .theme-prev {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
}
.theme-prev-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  padding: 6px;
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.theme-prev-bar {
  width: 42%;
  height: 5px;
  border-radius: var(--radius-pill);
}
.theme-prev-line {
  width: 80%;
  height: 3px;
  border-radius: var(--radius-pill);
  opacity: 0.45;
}
.theme-prev-line-short {
  width: 55%;
}
.theme-tile-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
}
.theme-tile-name {
  flex: 1;
  font-size: var(--text-xs);
  font-weight: 550;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.theme-tile-check {
  flex-shrink: 0;
  color: var(--color-accent);
}
.theme-tile.active .theme-tile-name {
  color: var(--color-accent);
}

.settings-foot {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.reset-btn {
  padding: 7px var(--space-3);
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
  .settings-backdrop {
    padding: 0;
    align-items: flex-end;
  }

  .settings-modal {
    width: 100%;
    max-height: 85vh;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: none;
    animation: slideUpMobile 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideUpMobile {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .settings-body {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-2);
    gap: var(--space-1);
  }
  .nav-item {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .settings-foot {
    padding-bottom: calc(var(--space-3) + var(--safe-bottom));
  }
}
</style>
