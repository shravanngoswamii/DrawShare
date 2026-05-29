<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useEditorStore } from "@/stores/editor";
import type { Tool } from "@/core/types";

defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const editor = useEditorStore();

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "highlighter", label: "Highlighter", icon: "highlight" },
  { id: "text", label: "Text", icon: "text" },
  { id: "eraser", label: "Eraser", icon: "eraser" },
];

const presetColors = [
  "#0f172a", "#1d4ed8", "#15803d", "#b45309",
  "#b91c1c", "#7c3aed", "#0891b2", "#a16207",
];

type Popover = "color" | "size" | null;
const popover = ref<Popover>(null);
function toggle(p: Exclude<Popover, null>) {
  popover.value = popover.value === p ? null : p;
}

// Colour, with remembered recents (issue #8)
const COLOR_KEY = "drawshare:color";
const RECENT_KEY = "drawshare:recentColors";
const recentColors = ref<string[]>([]);
const hexInput = ref("");

function isHex(v: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

function chooseColor(c: string) {
  if (!isHex(c)) return;
  editor.setColor(c);
  hexInput.value = c;
  try {
    localStorage.setItem(COLOR_KEY, c);
  } catch {
    /* ignore */
  }
  if (!presetColors.includes(c.toLowerCase())) {
    recentColors.value = [c, ...recentColors.value.filter((x) => x !== c)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentColors.value));
    } catch {
      /* ignore */
    }
  }
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(COLOR_KEY);
    if (saved && isHex(saved)) editor.setColor(saved);
    recentColors.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    /* ignore */
  }
  hexInput.value = editor.color;
});
</script>

<template>
  <aside class="toolbar" :class="{ 'is-collapsed': collapsed, quiet: editor.isDrawing }" aria-label="Drawing tools">
    <button class="toggle-btn" @click="emit('toggle')" title="Collapse toolbar" aria-label="Collapse toolbar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>

    <div class="toolbar-body">
      <div class="group">
        <button
          v-for="t in tools"
          :key="t.id"
          class="tool"
          :class="{ active: editor.tool === t.id }"
          :aria-pressed="editor.tool === t.id"
          :title="t.label"
          @click="editor.setTool(t.id)"
        >
          <svg v-if="t.icon === 'pen'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />
          </svg>
          <svg v-else-if="t.icon === 'highlight'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
          </svg>
          <svg v-else-if="t.icon === 'text'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" />
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />
          </svg>
        </button>
      </div>

      <div v-if="editor.tool === 'eraser'" class="group erase-modes">
        <button class="mini" :class="{ active: editor.eraserMode === 'stroke' }" title="Erase whole stroke" @click="editor.setEraserMode('stroke')">Whole</button>
        <button class="mini" :class="{ active: editor.eraserMode === 'area' }" title="Erase where rubbed" @click="editor.setEraserMode('area')">Area</button>
      </div>

      <div class="divider"></div>

      <div class="pop-wrap group">
        <button class="tool" :class="{ active: popover === 'size' }" title="Stroke size" @click="toggle('size')">
          <span class="size-dot" :style="{ width: `${Math.min(editor.size, 18)}px`, height: `${Math.min(editor.size, 18)}px` }"></span>
        </button>
        <div v-if="popover === 'size'" class="popover size-pop">
          <div class="pop-title">{{ editor.tool === 'eraser' ? 'Eraser size' : 'Size' }}</div>
          <input class="range" type="range" min="1" max="40" :value="editor.size" @input="editor.setSize(Number(($event.target as HTMLInputElement).value))" />
          <div class="pop-value">{{ editor.size }} px</div>
        </div>
      </div>

      <div v-if="editor.tool !== 'eraser'" class="pop-wrap group">
        <button class="tool color-trigger" :class="{ active: popover === 'color' }" title="Colour" @click="toggle('color')">
          <span class="color-chip" :style="{ background: editor.color }"></span>
        </button>
        <div v-if="popover === 'color'" class="popover color-pop">
          <div class="pop-title">Colour</div>
          <div class="swatches">
            <button v-for="c in presetColors" :key="c" class="swatch" :class="{ active: editor.color.toLowerCase() === c }" :style="{ background: c }" :title="c" @click="chooseColor(c)"></button>
          </div>
          <template v-if="recentColors.length">
            <div class="pop-sub">Recent</div>
            <div class="swatches">
              <button v-for="c in recentColors" :key="`r-${c}`" class="swatch" :class="{ active: editor.color === c }" :style="{ background: c }" :title="c" @click="chooseColor(c)"></button>
            </div>
          </template>
          <div class="pop-sub">Custom</div>
          <div class="custom-row">
            <input type="color" class="native-color" :value="editor.color" @input="chooseColor(($event.target as HTMLInputElement).value)" />
            <input type="text" class="hex" v-model="hexInput" maxlength="7" spellcheck="false" placeholder="#000000" @change="chooseColor(hexInput)" @keydown.enter="chooseColor(hexInput)" />
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="group">
        <button class="tool" title="Undo" @click="editor.undo()" :disabled="editor.history.length === 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
          </svg>
        </button>
        <button class="tool" title="Redo" @click="editor.redo()" :disabled="editor.redoStack.length === 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="popover" class="pop-backdrop" @click="popover = null"></div>
  </aside>
</template>

<style scoped>
.toolbar {
  position: absolute;
  left: 8px;
  top: 8px;
  height: fit-content;
  max-height: calc(100% - 16px);
  width: var(--toolbar-w);
  z-index: 10;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2) 0;
  overflow: visible;
  transform-origin: top left;
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease;
}

.toolbar.is-collapsed {
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
}

.toolbar.quiet {
  opacity: 0.12;
  pointer-events: none;
  transition: opacity 150ms ease;
}

.toggle-btn {
  width: 36px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: background 80ms ease, color 80ms ease;
}
.toggle-btn:hover { background: var(--color-surface-2); color: var(--color-text); }

.toolbar-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  width: 100%;
}

.group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.divider {
  width: 32px;
  height: 1px;
  background: var(--color-border);
  margin: var(--space-1) 0;
  flex-shrink: 0;
}

.tool {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
  flex-shrink: 0;
}
.tool:hover:not(:disabled) { background: var(--color-surface-2); color: var(--color-text); }
.tool:disabled { opacity: 0.4; cursor: not-allowed; }
.tool.active { background: var(--color-accent-soft); color: var(--color-accent); }

.size-dot {
  display: block;
  background: var(--color-text);
  border-radius: var(--radius-pill);
}

.color-chip {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.18);
}

.erase-modes { flex-direction: column; gap: 3px; }
.mini {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  width: 44px;
}
.mini:hover { background: var(--color-surface-2); }
.mini.active { background: var(--color-accent-soft); color: var(--color-accent); }

.pop-wrap { position: relative; }

.pop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5;
}

.popover {
  position: absolute;
  left: calc(100% + 10px);
  top: -6px;
  z-index: 11;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
  padding: var(--space-3);
  width: max-content;
}

.pop-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.pop-sub {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  margin: var(--space-2) 0 6px;
}

.size-pop { width: 180px; }
.range { width: 100%; accent-color: var(--color-accent); }
.pop-value {
  margin-top: 6px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(8, 18px);
  gap: 6px;
}
.swatch {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(15, 23, 42, 0.12);
  transition: transform 80ms ease;
}
.swatch:hover { transform: scale(1.12); }
.swatch.active { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--color-accent); }

.custom-row { display: flex; align-items: center; gap: var(--space-2); }
.native-color {
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
}
.hex {
  width: 90px;
  height: 28px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--text-xs);
}
.hex:focus { outline: none; border-color: var(--color-focus); box-shadow: 0 0 0 3px var(--color-focus-ring); }

@media (max-width: 767px) {
  .toolbar {
    position: static;
    width: 100%;
    height: var(--toolbar-h);
    flex-direction: row;
    background: var(--color-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-radius: 0;
    border: none;
    border-top: 1px solid var(--color-border);
    box-shadow: none;
    padding: 0 var(--space-3);
    padding-bottom: var(--safe-bottom);
    gap: var(--space-2);
    overflow-x: auto;
    overflow-y: visible;
    justify-content: flex-start;
    transform: none !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }
  .toggle-btn { display: none; }
  .toolbar-body { display: contents; }
  .group { flex-direction: row; gap: var(--space-1); flex-shrink: 0; }
  .erase-modes { flex-direction: row; }
  .divider { width: 1px; height: 24px; margin: 0 var(--space-1); }
  .tool { width: 40px; height: 40px; }
  .popover { left: auto; right: 0; top: auto; bottom: calc(100% + 10px); }
}
</style>
