<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import type { ShapeType, Tool } from "@/core/types";
import { useEditorStore } from "@/stores/editor";

const props = defineProps<{ collapsed?: boolean; panelOpen?: boolean; guest?: boolean }>();
const emit = defineEmits<{ toggle: []; "image-import": [] }>();

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

const isShapeTool = computed(() => shapeTools.some((t) => t.id === editor.tool));

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

type Popover = "color" | "size" | "eraser" | "shapes" | "present" | null;
const popover = ref<Popover>(null);
function toggle(p: Exclude<Popover, null>) {
  popover.value = popover.value === p ? null : p;
}

// Pick a shape from the shapes flyout, then close it.
function pickShape(id: ShapeType) {
  editor.setTool(id);
  popover.value = null;
}

// Toggle a presenter mode from the Present flyout, then close it so it doesn't
// sit over the canvas you're about to point at.
function pickPresenter(mode: "laser" | "spotlight") {
  editor.setPresenterMode(editor.presenterMode === mode ? "off" : mode);
  popover.value = null;
}

function onEraserClick() {
  if (editor.tool !== "eraser") {
    editor.setTool("eraser");
    popover.value = "eraser";
  } else {
    toggle("eraser");
  }
}

// Pen / highlighter own their size (and pen nib): selecting the tool the first
// time just activates it; tapping the already-active tool opens its size popover.
function onPenToolClick(id: Tool) {
  if (editor.tool === id) {
    toggle("size");
  } else {
    editor.setTool(id);
    popover.value = null;
  }
}

function setSize(v: number) {
  editor.setSize(Math.max(1, Math.min(200, Math.round(v) || 1)));
}

// Colour, with remembered recents (issue #8)
const COLOR_KEY = "drawshare:color";
const RECENT_KEY = "drawshare:recentColors";
const DOCK_KEY = "drawshare:dock";
const DOCK_POSITIONS_KEY = "drawshare:dock-positions";
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

// Magnetic docking: drag the toolbar, snap to nearest of left / right / top / bottom.
// Each side remembers its last position (fraction 0–1 along the edge).
type Dock = "left" | "right" | "top" | "bottom";

interface DockPositions {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Default dock: top-centre (top + 0.5 fraction). A saved choice overrides on mount.
const dock = ref<Dock>("top");
const dockPositions = ref<DockPositions>({ left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 });

// Clearance reserved at each end of an edge so the bar never lands on the fixed
// corner controls (back button, zoom pill, help/replay, mini-dock). The
// bottom-left zoom pill is the widest, so its corners get extra room.
const DOCK_CORNER = 64;
const DOCK_ZOOM = 132;
const dockMargins: Record<Dock, { start: number; end: number }> = {
  left: { start: DOCK_CORNER, end: DOCK_CORNER }, // back (top) / zoom (bottom)
  right: { start: DOCK_CORNER, end: DOCK_CORNER }, // mini-dock (top) / help+replay (bottom)
  top: { start: DOCK_CORNER, end: DOCK_CORNER }, // back (left) / mini-dock (right)
  bottom: { start: DOCK_ZOOM, end: DOCK_CORNER }, // zoom (left) / help+replay (right)
};
// Centre the bar within its edge but keep its whole length inside the safe band
// [half+start, edgeLen-half-end]; if it's too long to fit, centre it.
function clampDockFrac(localPos: number, edgeLen: number, half: number, dk: Dock): number {
  const lo = half + dockMargins[dk].start;
  const hi = edgeLen - half - dockMargins[dk].end;
  const c = lo <= hi ? Math.max(lo, Math.min(hi, localPos)) : edgeLen / 2;
  return c / edgeLen;
}
const dragging = ref(false);
const noTransition = ref(false);
const dragStyle = ref<Record<string, string>>({});
const horizontal = computed(() => dock.value === "top" || dock.value === "bottom");

// Compute the inline style that positions the toolbar on its docked edge.
const dockStyle = computed(() => {
  if (Object.keys(dragStyle.value).length > 0) return {} as Record<string, string>;
  const frac = dockPositions.value[dock.value];
  switch (dock.value) {
    case "left":
      return { left: "8px", top: `${frac * 100}%`, transform: "translateY(-50%)" };
    case "right":
      // Sit left of the pages panel when it's open so the two never overlap.
      return {
        right: props.panelOpen ? "calc(var(--sidepanel-w) + 16px)" : "8px",
        top: `${frac * 100}%`,
        transform: "translateY(-50%)",
      };
    case "top":
      return { top: "8px", left: `${frac * 100}%`, transform: "translateX(-50%)" };
    case "bottom":
      return { bottom: "8px", left: `${frac * 100}%`, transform: "translateX(-50%)" };
  }
});

function saveDockPositions() {
  try {
    localStorage.setItem(DOCK_POSITIONS_KEY, JSON.stringify(dockPositions.value));
  } catch {
    /* ignore */
  }
}

function onGripDown(e: PointerEvent) {
  e.preventDefault();
  popover.value = null;
  const grip = e.currentTarget as HTMLElement;
  // Own the pointer for the whole drag so its moves can't be mistaken for a
  // canvas stroke (belt-and-suspenders alongside the canvas over-target gate).
  grip.setPointerCapture?.(e.pointerId);
  const aside = grip.closest(".toolbar") as HTMLElement | null;
  if (!aside) return;
  // Capture toolbar size at drag-start (before position: fixed takes over).
  const rect = aside.getBoundingClientRect();
  const tbW = rect.width;
  const tbH = rect.height;
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
    };
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    grip.releasePointerCapture?.(ev.pointerId);
    if (!moved) {
      emit("toggle");
      return;
    }
    dragging.value = false;

    // Toolbar centre in viewport coords.
    const centerX = ev.clientX - offX + tbW / 2;
    const centerY = ev.clientY - offY + tbH / 2;

    // Use the container's bounding rect so frac matches what `top/left: X%`
    // resolves to — percentage is relative to the containing block, not the
    // full viewport (which can differ due to safe-area padding or flex sizing).
    const parent = aside.parentElement;
    const cRect = parent
      ? parent.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const cW = cRect.width || window.innerWidth;
    const cH = cRect.height || window.innerHeight;
    // Centre in container-local coordinates.
    const localX = centerX - cRect.left;
    const localY = centerY - cRect.top;

    // Which edge is nearest (use full viewport for the comparison).
    const dl = centerX;
    const dr = window.innerWidth - centerX;
    const dt = centerY;
    const db = window.innerHeight - centerY;
    const min = Math.min(dl, dr, dt, db);

    let newDock: Dock;
    let frac: number;
    if (min === dl) {
      newDock = "left";
      frac = clampDockFrac(localY, cH, tbH / 2, "left");
    } else if (min === dr) {
      newDock = "right";
      frac = clampDockFrac(localY, cH, tbH / 2, "right");
    } else if (min === dt) {
      newDock = "top";
      frac = clampDockFrac(localX, cW, tbW / 2, "top");
    } else {
      newDock = "bottom";
      frac = clampDockFrac(localX, cW, tbW / 2, "bottom");
    }

    // Snap to final position immediately (no spring from stale coords).
    noTransition.value = true;
    dragStyle.value = {};
    dock.value = newDock;
    // Spread-replace so Vue reactivity sees a new object reference.
    dockPositions.value = { ...dockPositions.value, [newDock]: frac };
    requestAnimationFrame(() => {
      noTransition.value = false;
    });

    try {
      localStorage.setItem(DOCK_KEY, dock.value);
    } catch {
      /* ignore */
    }
    saveDockPositions();
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
    if (d === "left" || d === "right" || d === "top" || d === "bottom") dock.value = d;
    const savedPositions = localStorage.getItem(DOCK_POSITIONS_KEY);
    if (savedPositions) {
      const parsed = JSON.parse(savedPositions) as Partial<DockPositions>;
      if (typeof parsed.left === "number") dockPositions.value.left = parsed.left;
      if (typeof parsed.right === "number") dockPositions.value.right = parsed.right;
      if (typeof parsed.top === "number") dockPositions.value.top = parsed.top;
      if (typeof parsed.bottom === "number") dockPositions.value.bottom = parsed.bottom;
    }
  } catch {
    /* ignore */
  }
  hexInput.value = editor.color;
  // Re-clamp a saved position once the bar has real dimensions, so a corner
  // position stored before the corner-clearance rule still snaps clear.
  nextTick(() => {
    const el = document.querySelector(".toolbar") as HTMLElement | null;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const r = el.getBoundingClientRect();
    const c = parent.getBoundingClientRect();
    const horiz = dock.value === "top" || dock.value === "bottom";
    const edgeLen =
      (horiz ? c.width : c.height) || (horiz ? window.innerWidth : window.innerHeight);
    const half = (horiz ? r.width : r.height) / 2;
    const clamped = clampDockFrac(
      dockPositions.value[dock.value] * edgeLen,
      edgeLen,
      half,
      dock.value,
    );
    if (Math.abs(clamped - dockPositions.value[dock.value]) > 0.001) {
      dockPositions.value = { ...dockPositions.value, [dock.value]: clamped };
    }
  });
});
</script>

<template>
  <aside
    class="toolbar"
    data-tour="toolbar"
    :class="[`dock-${dock}`, { 'is-collapsed': collapsed, quiet: editor.isDrawing, horizontal, dragging, 'no-transition': noTransition }]"
    :style="Object.keys(dragStyle).length > 0 ? dragStyle : dockStyle"
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
          class="tool"
          :class="{ active: editor.tool === 'select' }"
          :aria-pressed="editor.tool === 'select'"
          title="Select — move, resize or delete images, text and shapes"
          aria-label="Select tool"
          @click="editor.setTool('select')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
          </svg>
        </button>
        <div v-for="t in penTools" :key="t.id" class="pop-wrap">
          <button
            class="tool"
            :class="{ active: editor.tool === t.id }"
            :aria-pressed="editor.tool === t.id"
            :aria-expanded="popover === 'size' && editor.tool === t.id"
            :title="`${t.label} — tap again for size`"
            @click="onPenToolClick(t.id)"
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
          <div
            v-if="popover === 'size' && editor.tool === t.id"
            class="popover"
            :class="`pop-${dock}`"
            role="dialog"
            :aria-label="`${t.label} settings`"
          >
            <div class="pop-title">Size</div>
            <div class="size-row">
              <input class="range" type="range" min="1" max="40" :value="editor.size" :aria-label="`${t.label} size slider`" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
              <input class="num" type="number" min="1" max="200" :value="editor.size" :aria-label="`${t.label} size value`" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
            </div>
            <template v-if="t.id === 'pen'">
              <div class="pop-sub" id="pen-type-label">Pen</div>
              <div class="flyout-row" role="group" aria-labelledby="pen-type-label">
                <button class="pen-type-btn" :class="{ active: editor.penType === 'ballpoint' }" title="Ballpoint" aria-label="Ballpoint" :aria-pressed="editor.penType === 'ballpoint'" @click="editor.setPenType('ballpoint')">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20 C7 16 12 11 20 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
                <button class="pen-type-btn" :class="{ active: editor.penType === 'brush' }" title="Brush" aria-label="Brush" :aria-pressed="editor.penType === 'brush'" @click="editor.setPenType('brush')">
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21 C6 17 10 13 14 9 C17 6 20 4 21 3 C20 5 17 8 14 11 C10 15 7 18 4 22 Z" fill="currentColor"/></svg>
                </button>
                <button class="pen-type-btn" :class="{ active: editor.penType === 'marker' }" title="Marker" aria-label="Marker" :aria-pressed="editor.penType === 'marker'" @click="editor.setPenType('marker')">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20 L19 5" stroke="currentColor" stroke-width="7" stroke-linecap="square"/></svg>
                </button>
              </div>
            </template>
          </div>
        </div>

        <!-- Eraser with its own popover (size + mode) -->
        <div class="pop-wrap">
          <button class="tool" :class="{ active: editor.tool === 'eraser' }" :aria-pressed="editor.tool === 'eraser'" title="Eraser" aria-label="Eraser" @click="onEraserClick">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />
            </svg>
          </button>
          <div v-if="popover === 'eraser'" class="popover" :class="`pop-${dock}`" role="dialog" aria-label="Eraser settings">
            <div class="pop-title">Eraser size</div>
            <div class="size-row">
              <input class="range" type="range" min="1" max="60" :value="editor.size" aria-label="Eraser size slider" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
              <input class="num" type="number" min="1" max="200" :value="editor.size" aria-label="Eraser size value" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="pop-sub" id="eraser-mode-label">Mode</div>
            <div class="seg" role="group" aria-labelledby="eraser-mode-label">
              <button :class="{ active: editor.eraserMode === 'stroke' }" :aria-pressed="editor.eraserMode === 'stroke'" @click="editor.setEraserMode('stroke')">Whole</button>
              <button :class="{ active: editor.eraserMode === 'area' }" :aria-pressed="editor.eraserMode === 'area'" @click="editor.setEraserMode('area')">Area</button>
            </div>
            <div class="pop-sub" id="eraser-shape-label">Shape</div>
            <div class="seg" role="group" aria-labelledby="eraser-shape-label">
              <button :class="{ active: editor.eraserShape === 'circle' }" :aria-pressed="editor.eraserShape === 'circle'" @click="editor.setEraserShape('circle')">Circle</button>
              <button :class="{ active: editor.eraserShape === 'square' }" :aria-pressed="editor.eraserShape === 'square'" @click="editor.setEraserShape('square')">Square</button>
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Shapes: one button opens a flyout with the four shapes -->
      <div class="pop-wrap group">
        <button
          class="tool"
          :class="{ active: isShapeTool }"
          :aria-pressed="isShapeTool"
          :aria-expanded="popover === 'shapes'"
          title="Shapes"
          aria-label="Shapes"
          @click="toggle('shapes')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="13" height="13" rx="2" /><circle cx="16" cy="16" r="5" />
          </svg>
        </button>
        <div v-if="popover === 'shapes'" class="popover" :class="`pop-${dock}`" role="dialog" aria-label="Shapes">
          <div class="flyout-row">
            <button v-for="t in shapeTools" :key="t.id" class="tool" :class="{ active: editor.tool === t.id }" :aria-pressed="editor.tool === t.id" :title="t.label" :aria-label="t.label" @click="pickShape(t.id)">
              <svg v-if="t.id === 'rect'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              <svg v-else-if="t.id === 'ellipse'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>
              <svg v-else-if="t.id === 'line'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="20" x2="20" y2="4"/></svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19L19 5"/><path d="M9 5h10v10"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Stroke size for shapes (pen/highlighter carry their own; eraser too) -->
      <div v-if="isShapeTool" class="pop-wrap group">
        <button class="tool" :class="{ active: popover === 'size' }" title="Stroke size" aria-label="Stroke size" :aria-expanded="popover === 'size'" @click="toggle('size')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="2.75" /><circle cx="19.5" cy="12" r="4" />
          </svg>
        </button>
        <div v-if="popover === 'size'" class="popover" :class="`pop-${dock}`">
          <div class="pop-title">Size</div>
          <div class="size-row">
            <input class="range" type="range" min="1" max="40" :value="editor.size" aria-label="Stroke size slider" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
            <input class="num" type="number" min="1" max="200" :value="editor.size" aria-label="Stroke size value" @input="setSize(Number(($event.target as HTMLInputElement).value))" />
          </div>
        </div>
      </div>

      <!-- Colour (hidden for eraser) -->
      <div v-if="editor.tool !== 'eraser'" class="pop-wrap group">
        <button class="tool color-trigger" :class="{ active: popover === 'color' }" :title="`Stroke colour: ${editor.color}`" :aria-label="`Stroke colour: ${editor.color}`" :aria-expanded="popover === 'color'" @click="toggle('color')">
          <span class="color-chip" :style="{ background: editor.color }"></span>
        </button>
        <div v-if="popover === 'color'" class="popover" :class="`pop-${dock}`">
          <div class="pop-title">Colour</div>
          <div class="swatches" role="group" aria-label="Preset colours">
            <button v-for="c in presetColors" :key="c" class="swatch" :class="{ active: editor.color.toLowerCase() === c }" :style="{ background: c }" :title="c" :aria-label="`Colour ${c}`" :aria-pressed="editor.color.toLowerCase() === c" @click="chooseColor(c)"></button>
          </div>
          <template v-if="recentColors.length">
            <div class="pop-sub">Recent</div>
            <div class="swatches" role="group" aria-label="Recent colours">
              <button v-for="c in recentColors" :key="`r-${c}`" class="swatch" :class="{ active: editor.color === c }" :style="{ background: c }" :title="c" :aria-label="`Colour ${c}`" :aria-pressed="editor.color === c" @click="chooseColor(c)"></button>
            </div>
          </template>
          <div class="pop-sub">Custom</div>
          <div class="custom-row">
            <input type="color" class="native-color" :value="editor.color" aria-label="Custom colour picker" @input="chooseColor(($event.target as HTMLInputElement).value)" />
            <input type="text" class="hex" v-model="hexInput" maxlength="7" spellcheck="false" placeholder="#000000" aria-label="Hex colour value" @change="chooseColor(hexInput)" @keydown.enter="chooseColor(hexInput)" />
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="group">
        <button class="tool" title="Import image (or paste / drag & drop)" @click="emit('image-import')" aria-label="Import image">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-5-5L5 21"/>
          </svg>
        </button>
      </div>

      <div class="divider"></div>

      <div class="group">
        <button class="tool" title="Undo" aria-label="Undo" @click="editor.undo()" :disabled="editor.history.length === 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
          </svg>
        </button>
        <button class="tool" title="Redo" aria-label="Redo" @click="editor.redo()" :disabled="editor.redoStack.length === 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
          </svg>
        </button>
      </div>

      <div v-if="!props.guest" class="divider"></div>

      <!-- Presenter aids: one button opens a flyout with laser + spotlight.
           Host-only — hidden for live-session guests. -->
      <div v-if="!props.guest" class="pop-wrap group">
        <button
          class="tool"
          :class="{ active: editor.presenterMode !== 'off' }"
          :aria-pressed="editor.presenterMode !== 'off'"
          :aria-expanded="popover === 'present'"
          title="Present"
          aria-label="Presenter tools"
          @click="toggle('present')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/>
            <line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/>
          </svg>
        </button>
        <div v-if="popover === 'present'" class="popover" :class="`pop-${dock}`" role="dialog" aria-label="Presenter tools">
          <div class="pop-title">Present</div>
          <div class="present-list">
            <button class="present-item" :class="{ active: editor.presenterMode === 'laser' }" :aria-pressed="editor.presenterMode === 'laser'" @click="pickPresenter('laser')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
              </svg>
              <span>Laser pointer</span>
            </button>
            <button class="present-item" :class="{ active: editor.presenterMode === 'spotlight' }" :aria-pressed="editor.presenterMode === 'spotlight'" @click="pickPresenter('spotlight')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="9" stroke-dasharray="3 3" stroke-opacity="0.5" />
              </svg>
              <span>Spotlight</span>
            </button>
          </div>
        </div>
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

/* dock-* classes set transform-origin for scale animations only;
   actual position is driven by dockStyle inline style. */
.dock-left { transform-origin: left center; }
.dock-right { transform-origin: right center; }
.dock-top { transform-origin: top center; }
.dock-bottom { transform-origin: bottom center; }

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
.toolbar.no-transition { transition: none !important; }

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

.pen-type-btn {
  width: 38px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
  flex-shrink: 0;
}
.pen-type-btn:hover { background: var(--color-surface-2); color: var(--color-text); }
.pen-type-btn.active { background: var(--color-accent-soft); color: var(--color-accent); }

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
.pop-right { right: calc(100% + 10px); top: -6px; }
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

/* Row of icon buttons inside a flyout (shapes, pen nibs) */
.flyout-row { display: flex; gap: 4px; }

/* Present flyout: labelled rows */
.present-list { display: flex; flex-direction: column; gap: 4px; }
.present-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.present-item:hover { background: var(--color-surface-2); color: var(--color-text); }
.present-item.active { background: var(--color-accent-soft); color: var(--color-accent); }

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

/* Short, wide viewports (e.g. iPad in landscape): the vertical toolbar grew tall
   enough to run off-screen. Compact the buttons and gaps so every tool fits
   without scrolling (scrolling would clip the side popovers). */
@media (min-width: 768px) and (max-height: 860px) {
  .toolbar:not(.horizontal) {
    padding: 4px;
  }
  .toolbar:not(.horizontal) .toolbar-body {
    gap: 3px;
    padding: 0;
  }
  .toolbar:not(.horizontal) .group {
    gap: 2px;
  }
  .toolbar:not(.horizontal) .tool,
  .toolbar:not(.horizontal) .pen-type-btn {
    width: 32px;
    height: 32px;
  }
  .toolbar:not(.horizontal) .divider {
    margin: 2px 0;
  }
  .toolbar:not(.horizontal) .grip {
    height: 14px;
  }
}

/* Mobile keeps the simple bottom bar regardless of dock */
@media (max-width: 767px) {
  /* Floating pill, centred near the bottom and horizontally scrollable — it sits
     over the canvas instead of reserving a full-width strip. Centred with
     margin:auto (NOT transform) and a solid background (NOT glass), so neither a
     transform nor a backdrop-filter creates a containing block — that lets the
     tool popovers (position:fixed) escape the pill's scroll clip. The desktop
     dockStyle is applied inline, so the overrides need !important. */
  .toolbar,
  .toolbar.dock-left,
  .toolbar.dock-right,
  .toolbar.dock-top,
  .toolbar.dock-bottom {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    bottom: calc(var(--safe-bottom) + 12px) !important;
    margin: 0 auto !important;
    transform: none !important;
    width: max-content;
    max-width: calc(100vw - 24px);
    height: auto;
    flex-direction: row;
    align-items: center;
    background: var(--color-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    box-shadow: 0 6px 20px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
    padding: 4px 6px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    opacity: 1 !important;
    pointer-events: auto !important;
    z-index: 30;
  }
  .toolbar::-webkit-scrollbar {
    display: none;
  }
  .grip,
  .toggle-btn {
    display: none;
  }
  .toolbar-body {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    gap: var(--space-1);
  }
  .group {
    flex-direction: row;
    gap: var(--space-1);
    flex-shrink: 0;
  }
  .divider {
    width: 1px;
    height: 24px;
    margin: 0 2px;
    flex-shrink: 0;
  }
  .tool {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }
  /* Popovers open as a centred card above the pill (fixed → escapes the scroll
     clip, since the pill has no transform/filter). */
  .popover {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    bottom: calc(var(--safe-bottom) + 68px) !important;
    margin: 0 auto !important;
    width: max-content !important;
    max-width: calc(100vw - 24px) !important;
    transform: none !important;
  }
}
</style>
