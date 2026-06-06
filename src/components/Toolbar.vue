<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ShapeType, Tool } from "@/core/types";
import { useEditorStore } from "@/stores/editor";

defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const editor = useEditorStore();

const penTools: { id: Tool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "highlighter", label: "Highlighter", icon: "highlight" },
  { id: "text", label: "Text", icon: "text" },
];

const shapeTools: { id: ShapeType; label: string }[] = [
  { id: "rect", label: "Rectangle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
];

const presetColors = [
  "#0f172a",
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#b91c1c",
  "#7c3aed",
  "#0891b2",
  "#a16207",
];

type Popover = "color" | "size" | "eraser" | null;
const popover = ref<Popover>(null);
function toggle(p: Exclude<Popover, null>) {
  popover.value = popover.value === p ? null : p;
}

function onEraserClick() {
  if (editor.tool !== "eraser") {
    editor.setTool("eraser");
    popover.value = "eraser";
  } else {
    toggle("eraser");
  }
}

function setSize(v: number) {
  editor.setSize(Math.max(1, Math.min(200, Math.round(v) || 1)));
}

// Colour, with remembered recents (issue #8)
const COLOR_KEY = "drawshare:color";
const RECENT_KEY = "drawshare:recentColors";
const DOCK_KEY = "drawshare:dock";
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

// Magnetic docking: drag the toolbar, snap to the nearest of left / top / bottom.
type Dock = "left" | "top" | "bottom";
const dock = ref<Dock>("left");
const dragging = ref(false);
const dragStyle = ref<Record<string, string>>({});
const horizontal = computed(() => dock.value !== "left");

function onGripDown(e: PointerEvent) {
  e.preventDefault();
  popover.value = null;
  const aside = (e.currentTarget as HTMLElement).closest(".toolbar") as HTMLElement | null;
  if (!aside) return;
  const rect = aside.getBoundingClientRect();
  const offX = e.clientX - rect.left;
  const offY = e.clientY - rect.top;
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
      moved = true;
      dragging.value = true;
    }
    if (!moved) return;
    dragStyle.value = {
      position: "fixed",
      left: `${ev.clientX - offX}px`,
      top: `${ev.clientY - offY}px`,
      right: "auto",
      bottom: "auto",
      transform: "none",
      transition: "none",
      margin: "0",
      maxHeight: "none",
    };
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (!moved) {
      emit("toggle"); // a tap (no drag) collapses the toolbar
      return;
    }
    dragging.value = false;
    dragStyle.value = {};
    const dl = ev.clientX;
    const dt = ev.clientY;
    const db = window.innerHeight - ev.clientY;
    const min = Math.min(dl, dt, db);
    dock.value = min === dl ? "left" : min === dt ? "top" : "bottom";
    try {
      localStorage.setItem(DOCK_KEY, dock.value);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(COLOR_KEY);
    if (saved && isHex(saved)) editor.setColor(saved);
    recentColors.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    const d = localStorage.getItem(DOCK_KEY);
    if (d === "left" || d === "top" || d === "bottom") dock.value = d;
  } catch {
    /* ignore */
  }
  hexInput.value = editor.color;
});
</script>

<template>
  <aside
    class="toolbar"
    :class="[`dock-${dock}`, { 'is-collapsed': collapsed, quiet: editor.isDrawing, horizontal, dragging }]"
    :style="dragStyle"
    aria-label="Drawing tools"
  >
    <button class="grip" @pointerdown="onGripDown" title="Drag to move, tap to collapse" aria-label="Move or collapse toolbar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
        <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
        <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
      </svg>
    </button>

    <div class="toolbar-body">
      <div class="group">
        <button
          v-for="t in penTools"
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
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" />
          </svg>
        </button>

        <!-- Eraser with its own popover (size + mode) -->
        <div class="pop-wrap">
          <button class="tool" :class="{ active: editor.tool === 'eraser' }" :aria-pressed="editor.tool === 'eraser'" title="Eraser" @click="onEraserClick">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />
            </svg>
          </button>
          <div v-if="popover === 'eraser'" class="popover" :class="`pop-${dock}`">
            <div class="pop-title">Eraser size</div>
            <div class="size-row">
              <input class="range" type="range" min="1" max="60" :value="editor.size" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
              <input class="num" type="number" min="1" max="200" :value="editor.size" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="pop-sub">Mode</div>
            <div class="seg">
              <button :class="{ active: editor.eraserMode === 'stroke' }" @click="editor.setEraserMode('stroke')">Whole</button>
              <button :class="{ active: editor.eraserMode === 'area' }" @click="editor.setEraserMode('area')">Area</button>
            </div>
            <div class="pop-sub">Shape</div>
            <div class="seg">
              <button :class="{ active: editor.eraserShape === 'circle' }" @click="editor.setEraserShape('circle')">Circle</button>
              <button :class="{ active: editor.eraserShape === 'square' }" @click="editor.setEraserShape('square')">Square</button>
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="group">
        <button v-for="t in shapeTools" :key="t.id" class="tool" :class="{ active: editor.tool === t.id }" :aria-pressed="editor.tool === t.id" :title="t.label" @click="editor.setTool(t.id)">
          <svg v-if="t.id === 'rect'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          <svg v-else-if="t.id === 'ellipse'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>
          <svg v-else-if="t.id === 'line'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="20" x2="20" y2="4"/></svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19L19 5"/><path d="M9 5h10v10"/></svg>
        </button>
      </div>

      <div class="divider"></div>

      <!-- Stroke size (hidden for eraser, which has its own) -->
      <div v-if="editor.tool !== 'eraser'" class="pop-wrap group">
        <button class="tool" :class="{ active: popover === 'size' }" title="Stroke size" @click="toggle('size')">
          <span class="size-dot" :style="{ width: `${Math.min(editor.size, 18)}px`, height: `${Math.min(editor.size, 18)}px` }"></span>
        </button>
        <div v-if="popover === 'size'" class="popover" :class="`pop-${dock}`">
          <div class="pop-title">Size</div>
          <div class="size-row">
            <input class="range" type="range" min="1" max="40" :value="editor.size" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
            <input class="num" type="number" min="1" max="200" :value="editor.size" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
          </div>
        </div>
      </div>

      <!-- Colour (hidden for eraser) -->
      <div v-if="editor.tool !== 'eraser'" class="pop-wrap group">
        <button class="tool color-trigger" :class="{ active: popover === 'color' }" title="Colour" @click="toggle('color')">
          <span class="color-chip" :style="{ background: editor.color }"></span>
        </button>
        <div v-if="popover === 'color'" class="popover" :class="`pop-${dock}`">
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
  z-index: 10;
  background: var(--color-glass-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 14px;
  box-shadow: 0 8px 24px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  overflow: visible;
  /* Magnetic snap easing */
  transition:
    left 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    top 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    right 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    bottom 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 200ms ease, opacity 180ms ease;
}

.dock-left { left: 8px; top: 50%; transform: translateY(-50%); transform-origin: left center; }
.dock-top { top: 8px; left: 50%; transform: translateX(-50%); transform-origin: top center; }
.dock-bottom { bottom: 8px; left: 50%; transform: translateX(-50%); transform-origin: bottom center; }

.toolbar.horizontal {
  flex-direction: row;
  padding: 0 var(--space-2);
}
.toolbar.horizontal .toolbar-body { flex-direction: row; }
.toolbar.horizontal .group { flex-direction: row; }
.toolbar.horizontal .divider { width: 1px; height: 28px; margin: 0 var(--space-1); }
.toolbar.horizontal .grip { width: 28px; height: 36px; }
.toolbar:not(.horizontal) .grip svg { transform: rotate(90deg); }

.toolbar.dragging { cursor: grabbing; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.2); }

.toolbar.is-collapsed { transform: scale(0); opacity: 0; pointer-events: none; }
.toolbar.quiet { opacity: 0.12; pointer-events: none; transition: opacity 150ms ease; }

.grip {
  width: 36px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  opacity: 0.6;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}
.grip:hover { opacity: 1; }

.toolbar-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.group { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }

.divider { width: 32px; height: 1px; background: var(--color-border); margin: var(--space-1) 0; flex-shrink: 0; }

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

.size-dot { display: block; background: var(--color-text); border-radius: var(--radius-pill); }

.color-chip {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border-strong);
}

.pop-wrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }

.pop-backdrop { position: fixed; inset: 0; z-index: 5; }

.popover {
  position: absolute;
  z-index: 11;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--color-glass-shadow);
  padding: var(--space-3);
  width: max-content;
}
/* Open away from the docked edge */
.pop-left { left: calc(100% + 10px); top: -6px; }
.pop-top { top: calc(100% + 10px); left: 50%; transform: translateX(-50%); }
.pop-bottom { bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); }

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

.size-row { display: flex; align-items: center; gap: var(--space-2); width: 200px; }
.range { flex: 1; accent-color: var(--color-accent); }
.num {
  width: 52px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.num:focus, .hex:focus { outline: none; border-color: var(--color-focus); box-shadow: 0 0 0 3px var(--color-focus-ring); }

.seg { display: flex; gap: 4px; }
.seg button {
  flex: 1;
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: var(--color-surface-2);
}
.seg button.active { background: var(--color-accent-soft); color: var(--color-accent); }

.swatches { display: grid; grid-template-columns: repeat(8, 18px); gap: 6px; }
.swatch {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  transition: transform 80ms ease;
}
.swatch:hover { transform: scale(1.12); }
.swatch.active { box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent); }

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

/* Mobile keeps the simple bottom bar regardless of dock */
@media (max-width: 767px) {
  .toolbar,
  .toolbar.dock-left,
  .toolbar.dock-top,
  .toolbar.dock-bottom {
    position: static;
    width: 100%;
    height: var(--toolbar-h);
    flex-direction: row;
    transform: none;
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
    opacity: 1 !important;
    pointer-events: auto !important;
  }
  .grip, .toggle-btn { display: none; }
  .toolbar-body { display: contents; }
  .group { flex-direction: row; gap: var(--space-1); flex-shrink: 0; }
  .divider { width: 1px; height: 24px; margin: 0 var(--space-1); }
  .tool { width: 40px; height: 40px; }
  .popover { left: auto; right: 0; top: auto; bottom: calc(100% + 10px); transform: none; }
}
</style>
