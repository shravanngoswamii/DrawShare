<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PointerInputAdapter } from "@/adapters/input/pointerInput";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { drawStack, resolveSheetColors, type SheetColors } from "@/composables/useStackRenderer";
import { useTheme } from "@/composables/useTheme";
import { newId } from "@/core/ids";
import { adaptInk } from "@/core/ink";
import {
  nearestSheetIndex,
  PAGE_H,
  PAGE_W,
  sheetWorldPos,
  visibleSheetRange,
  worldToSheet,
} from "@/core/layout";
import type { InputSample } from "@/core/ports";
import type { Page, Stroke, StrokePoint, TextItem } from "@/core/types";
import { dlog } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ page: Page }>();
const editor = useEditorStore();
const live = useLiveStore();
const { isDark } = useTheme();

function applyInkAdapter() {
  baseRenderer.setInkAdapter((c) => adaptInk(c, isDark.value));
  liveRenderer.setInkAdapter((c) => adaptInk(c, isDark.value));
}

const wrap = ref<HTMLDivElement | null>(null);
const baseEl = ref<HTMLCanvasElement | null>(null);
const liveEl = ref<HTMLCanvasElement | null>(null);

const baseRenderer = new Canvas2DRenderer();
const liveRenderer = new Canvas2DRenderer();
const input = new PointerInputAdapter();

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

// Camera – plain object for perf (mutated directly, not reactive)
const cam = { x: 0, y: 0, zoom: 1 };

// Reactive state for template only
const zoomLabel = ref("100%");
const bgStyle = ref({ backgroundSize: "32px 32px", backgroundPosition: "0px 0px" });
const panCursor = ref(false);

// ── Notebook stack (continuous A4 sheets) ───────────────────────────────────
const isNotebook = () => editor.notebookMode !== "off";
// Screen-space frame boxes for each visible sheet (notebook mode only).
const sheetFrames = ref<
  Array<{ id: string; left: number; top: number; width: number; height: number; active: boolean }>
>([]);
// World origin of the sheet the in-progress stroke is anchored to (0,0 in Free mode).
let drawOffsetX = 0;
let drawOffsetY = 0;
// Sheet paper/pattern colours, resolved from the theme on mount + theme change.
let sheetColors: SheetColors = {
  paper: "#ffffff",
  line: "rgba(148,163,184,0.4)",
  dot: "rgba(148,163,184,0.6)",
};

// Text tool editing overlay
const textInput = ref<HTMLTextAreaElement | null>(null);
const editing = ref<{
  id: string;
  pageId: string;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  existed: boolean;
} | null>(null);
const editStyle = ref<Record<string, string>>({});

// Eraser cursor overlay (screen coords relative to the stage)
const eraseCursor = ref<{ x: number; y: number } | null>(null);

let currentStroke: Stroke | undefined;
let isErasing = false;
let textDrag: {
  item: TextItem;
  downX: number;
  downY: number;
  origX: number;
  origY: number;
  moved: boolean;
} | null = null;
let predictedPoints: StrokePoint[] = [];
let liveSendCursor = 0;
let frameQueued = false;
let dirtyBase = true;
let viewW = 0;
let viewH = 0;

// Strict notebook mode: once a stroke exits the sheet boundary, block further points.
let strictBlocked = false;

// Area-erase is locked to the sheet it started on (notebook mode), so its single
// before/after snapshot stays correct even if the eraser drifts across a gap.
let eraseLockId: string | undefined;
let eraseOffX = 0;
let eraseOffY = 0;

// Navigation state (plain booleans – not reactive)
let spaceHeld = false;
let panActive = false;
let panPointerId: number | undefined;
let panLastX = 0;
let panLastY = 0;
const touchPoints = new Map<number, { x: number; y: number }>();
let pinchActive = false;
let pinchLastDist = 0;
let pinchLastMx = 0;
let pinchLastMy = 0;

function dpr() {
  return window.devicePixelRatio || 1;
}

function updateBg() {
  // Adaptive world-space grid: base cell = 40 world units, adapts by powers of 2
  // to keep screen spacing in [20, 100] px — scales visually with zoom.
  let worldStep = 40;
  let screenStep = worldStep * cam.zoom;
  while (screenStep < 20) {
    worldStep *= 2;
    screenStep *= 2;
  }
  while (screenStep > 100) {
    worldStep /= 2;
    screenStep /= 2;
  }
  const ox = (((-cam.x * cam.zoom) % screenStep) + screenStep) % screenStep;
  const oy = (((-cam.y * cam.zoom) % screenStep) + screenStep) % screenStep;
  bgStyle.value = {
    backgroundSize: `${screenStep}px ${screenStep}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  };
}

// World origin of a page's sheet (0,0 in Free mode or when not found).
function pageOffset(pageId: string | undefined): { x: number; y: number } {
  if (!pageId || editor.notebookMode === "off") return { x: 0, y: 0 };
  const i = editor.pages.findIndex((p) => p.id === pageId);
  return i >= 0 ? sheetWorldPos(i, editor.notebookLayout) : { x: 0, y: 0 };
}

// Strict-mode boundary in the active sheet's page-local coords (0,0)..(PAGE_W,PAGE_H).
function isInSheet(lx: number, ly: number): boolean {
  return lx >= 0 && lx <= PAGE_W && ly >= 0 && ly <= PAGE_H;
}

function strictFinalSampleOutOfBounds(sample?: InputSample): boolean {
  if (!sample || editor.notebookMode !== "strict") return false;
  const p = toPagePoint(sample);
  return !isInSheet(p.x, p.y);
}

// Page-local point where the segment from an in-sheet point to an out-of-sheet
// point crosses the sheet boundary, so a strict stroke ends exactly on the edge.
function clampToSheetBoundary(
  inside: { x: number; y: number },
  outside: { x: number; y: number },
): { x: number; y: number } {
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  let t = 1;
  if (dx > 0) t = Math.min(t, (PAGE_W - inside.x) / dx);
  else if (dx < 0) t = Math.min(t, -inside.x / dx);
  if (dy > 0) t = Math.min(t, (PAGE_H - inside.y) / dy);
  else if (dy < 0) t = Math.min(t, -inside.y / dy);
  t = Math.max(0, Math.min(1, t));
  return { x: inside.x + dx * t, y: inside.y + dy * t };
}

// Recompute the notebook sheet frame boxes (no-op in Free mode — no A4 guide).
function updatePageOverlay() {
  if (isNotebook()) updateSheetFrames();
}

// Notebook mode: screen-space frame boxes for every visible sheet.
function updateSheetFrames() {
  const layout = editor.notebookLayout;
  const count = editor.pages.length;
  const frames: typeof sheetFrames.value = [];
  for (let i = 0; i < count; i++) {
    const page = editor.pages[i];
    const { x, y } = sheetWorldPos(i, layout);
    frames.push({
      id: page.id,
      left: (x - cam.x) * cam.zoom,
      top: (y - cam.y) * cam.zoom,
      width: PAGE_W * cam.zoom,
      height: PAGE_H * cam.zoom,
      active: page.id === editor.currentPageId,
    });
  }
  sheetFrames.value = frames;
}

// Fit a single sheet to the viewport (used on open / mode switch).
function centerOnSheet(pageId: string) {
  const { x, y } = pageOffset(pageId);
  const MARGIN = 40;
  const fitZoom = Math.min((viewW - MARGIN * 2) / PAGE_W, (viewH - MARGIN * 2) / PAGE_H, MAX_ZOOM);
  cam.zoom = Math.max(MIN_ZOOM, fitZoom);
  cam.x = x + PAGE_W / 2 - viewW / (2 * cam.zoom);
  cam.y = y + PAGE_H / 2 - viewH / (2 * cam.zoom);
  syncCamera();
}

// Animate the camera to bring a sheet into view, keeping the current zoom.
let scrollAnim = 0;
function scrollToSheet(pageId: string) {
  const { x, y } = pageOffset(pageId);
  const targetX = x + PAGE_W / 2 - viewW / (2 * cam.zoom);
  const targetY = y + PAGE_H / 2 - viewH / (2 * cam.zoom);
  const fromX = cam.x;
  const fromY = cam.y;
  const start = performance.now();
  const DUR = 260;
  cancelAnimationFrame(scrollAnim);
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DUR);
    const e = 1 - (1 - t) ** 3; // ease-out cubic
    cam.x = fromX + (targetX - fromX) * e;
    cam.y = fromY + (targetY - fromY) * e;
    syncCamera();
    if (t < 1) scrollAnim = requestAnimationFrame(step);
  };
  scrollAnim = requestAnimationFrame(step);
}

// Notebook mode: track which sheet is centered in the viewport as the "active sheet".
function updateActiveSheet() {
  if (!isNotebook() || editor.pages.length === 0) return;
  const cx = cam.x + viewW / (2 * cam.zoom);
  const cy = cam.y + viewH / (2 * cam.zoom);
  const idx = nearestSheetIndex(cx, cy, editor.pages.length, editor.notebookLayout);
  const id = editor.pages[idx]?.id;
  if (id && id !== editor.currentPageId) editor.setActiveSheet(id);
}

function syncCamera() {
  baseRenderer.setCamera({ ...cam });
  liveRenderer.setCamera({ ...cam });
  zoomLabel.value = `${Math.round(cam.zoom * 100)}%`;
  updateBg();
  updatePageOverlay();
  updateActiveSheet();
  updateEditStyle();
  live.setHostCamera(cam.x, cam.y, cam.zoom);
  dirtyBase = true;
  schedule();
}

function fitCanvas() {
  if (!wrap.value || !baseEl.value || !liveEl.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const ratio = dpr();
  viewW = rect.width;
  viewH = rect.height;
  baseRenderer.setViewport(viewW, viewH, ratio);
  liveRenderer.setViewport(viewW, viewH, ratio);
  // Apply current camera without resetting it
  baseRenderer.setCamera({ ...cam });
  liveRenderer.setCamera({ ...cam });
  live.setHostViewport(viewW, viewH);
  updateBg();
  updatePageOverlay();
  dirtyBase = true;
  schedule();
}

function toWorld(sx: number, sy: number) {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}

function zoomAt(pivotX: number, pivotY: number, factor: number) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
  if (Math.abs(next - cam.zoom) < 1e-9) return;
  // World point under pivot stays fixed after zoom change
  const wx = pivotX / cam.zoom + cam.x;
  const wy = pivotY / cam.zoom + cam.y;
  cam.zoom = next;
  cam.x = wx - pivotX / cam.zoom;
  cam.y = wy - pivotY / cam.zoom;
  syncCamera();
}

function panBy(screenDx: number, screenDy: number) {
  cam.x -= screenDx / cam.zoom;
  cam.y -= screenDy / cam.zoom;
  syncCamera();
}

function resetView() {
  cam.x = 0;
  cam.y = 0;
  cam.zoom = 1;
  syncCamera();
}

function zoomIn() {
  zoomAt(viewW / 2, viewH / 2, 1.25);
}

function zoomOut() {
  zoomAt(viewW / 2, viewH / 2, 0.8);
}

function schedule() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(render);
}

function visibleRange() {
  const layout = editor.notebookLayout;
  const min = layout === "horizontal" ? cam.x : cam.y;
  const span = layout === "horizontal" ? viewW / cam.zoom : viewH / cam.zoom;
  return visibleSheetRange(editor.pages.length, layout, min, min + span);
}

function render() {
  frameQueued = false;
  if (dirtyBase) {
    baseRenderer.clear();
    if (isNotebook()) {
      drawStack(
        baseRenderer,
        editor.pages,
        editor.strokes,
        editor.notebookLayout,
        sheetColors,
        visibleRange(),
        editing.value?.id,
      );
    } else {
      baseRenderer.beginFrame();
      for (const s of editor.strokes) baseRenderer.drawStroke(s);
      for (const t of editor.currentPage?.texts ?? []) {
        if (editing.value?.id === t.id) continue;
        baseRenderer.drawText(t);
      }
      baseRenderer.endFrame();
    }
    dlog(`render base strokes=${editor.strokes.length} cur=${currentStroke ? "y" : "n"}`);
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (currentStroke && currentStroke.points.length > 0) {
    // The in-progress stroke is page-local; shift the live camera by the active
    // sheet origin so drawLive paints it at the sheet's world position (no-op in
    // Free mode where drawOffset is 0).
    liveRenderer.setCamera({ x: cam.x - drawOffsetX, y: cam.y - drawOffsetY, zoom: cam.zoom });
    liveRenderer.beginFrame();
    // Keep the in-progress stroke inside its sheet, matching the committed layer.
    if (isNotebook()) liveRenderer.pushClip(PAGE_W, PAGE_H);
    if (predictedPoints.length > 0) {
      liveRenderer.drawLive({
        ...currentStroke,
        points: [...currentStroke.points, ...predictedPoints],
      });
    } else {
      liveRenderer.drawLive(currentStroke);
    }
    if (isNotebook()) liveRenderer.popClip();
    liveRenderer.endFrame();
    if (live.mode === "host" && currentStroke.points.length > liveSendCursor) {
      const newPoints = currentStroke.points.slice(liveSendCursor);
      live.broadcast({
        t: "stroke-points",
        pageId: currentStroke.pageId,
        strokeId: currentStroke.id,
        points: newPoints,
        from: liveSendCursor,
      });
      liveSendCursor = currentStroke.points.length;
    }
  }
}

// Screen sample → stored stroke point. In notebook mode this is page-local
// (relative to the active sheet); in Free mode drawOffset is 0 so it's world.
function toPagePoint(s: InputSample): StrokePoint {
  const w = toWorld(s.x, s.y);
  return { x: w.x - drawOffsetX, y: w.y - drawOffsetY, p: s.pressure, t: s.t };
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax,
    dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

let areaErased = false;

function eraseAt(wx: number, wy: number) {
  const r = editor.size / cam.zoom;
  // Area erase stays on the sheet it started on (keeps its snapshot coherent).
  if (editor.eraserMode === "area") {
    if (!eraseLockId) return;
    const lx = wx - eraseOffX;
    const ly = wy - eraseOffY;
    if (editor.eraseArea(eraseLockId, lx, ly, r)) {
      areaErased = true;
      dirtyBase = true;
      schedule();
    }
    return;
  }
  // Stroke erase routes to the sheet under the pointer and may cross sheets.
  let pageId = props.page.id;
  let lx = wx;
  let ly = wy;
  if (isNotebook()) {
    const hit = worldToSheet(wx, wy, editor.pages.length, editor.notebookLayout);
    if (!hit) return;
    pageId = editor.pages[hit.index].id;
    lx = hit.localX;
    ly = hit.localY;
  }
  const toDelete = editor.strokes.filter((stroke) => {
    if (stroke.pageId !== pageId) return false;
    const pts = stroke.points;
    if (pts.length === 0) return false;
    if (pts.length === 1) return Math.hypot(pts[0].x - lx, pts[0].y - ly) < r;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(lx, ly, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < r) return true;
    }
    return false;
  });
  if (toDelete.length === 0) return;
  for (const stroke of toDelete) editor.eraseStroke(stroke.id);
  dirtyBase = true;
  schedule();
}

// ── Text tool ────────────────────────────────────────────────────────────────

function updateEditStyle() {
  const e = editing.value;
  if (!e) return;
  editStyle.value = {
    left: `${(e.x - cam.x) * cam.zoom}px`,
    top: `${(e.y - cam.y) * cam.zoom}px`,
    fontSize: `${e.size * cam.zoom}px`,
    color: adaptInk(e.color, isDark.value),
  };
  requestAnimationFrame(autosizeText);
}

// Grow the editing box to fit its content so multiline text (shift+enter) is
// fully visible while typing instead of being clipped to one line.
function autosizeText() {
  const el = textInput.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.width = "auto";
  el.style.height = `${el.scrollHeight}px`;
  el.style.width = `${el.scrollWidth + 4}px`;
}

// Drag the text box while editing by grabbing near its dashed border. Clicks in
// the middle still place the caret for typing.
function onEditPointerDown(e: PointerEvent) {
  const el = textInput.value;
  const ed = editing.value;
  if (!el || !ed) return;
  const rect = el.getBoundingClientRect();
  const edge = 16;
  const nearBorder =
    e.clientX - rect.left < edge ||
    rect.right - e.clientX < edge ||
    e.clientY - rect.top < edge ||
    rect.bottom - e.clientY < edge;
  if (!nearBorder) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const origX = ed.x;
  const origY = ed.y;
  const onMove = (ev: PointerEvent) => {
    if (!editing.value) return;
    editing.value.x = origX + (ev.clientX - startX) / cam.zoom;
    editing.value.y = origY + (ev.clientY - startY) / cam.zoom;
    updateEditStyle();
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// Hit-test a tap (world coords) against a text. Texts are page-local in notebook
// mode, so add the sheet offset to compare in world space (no-op in Free mode).
function hitText(t: TextItem, wx: number, wy: number): boolean {
  const off = pageOffset(t.pageId);
  const tx = t.x + off.x;
  const ty = t.y + off.y;
  const lines = t.text.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const w = longest * t.size * 0.6;
  const h = lines.length * t.size * 1.3;
  return wx >= tx && wx <= tx + w && wy >= ty && wy <= ty + h;
}

// The editing overlay works in WORLD coords (so it positions correctly); stored
// text is page-local, so convert on the way in (existing) and out (commit).
function beginTextAt(wx: number, wy: number, existing?: TextItem, pageId?: string) {
  const pid = existing?.pageId ?? pageId ?? props.page.id;
  const off = pageOffset(pid);
  editing.value = {
    id: existing?.id ?? newId(),
    pageId: pid,
    x: existing ? existing.x + off.x : wx,
    y: existing ? existing.y + off.y : wy,
    text: existing?.text ?? "",
    size: existing?.size ?? editor.size * 6,
    color: existing?.color ?? editor.color,
    existed: !!existing,
  };
  updateEditStyle();
  dirtyBase = true;
  schedule();
  nextTick(() => {
    textInput.value?.focus();
    autosizeText();
  });
}

function commitEditing() {
  const e = editing.value;
  if (!e) return;
  editing.value = null;
  const text = e.text.replace(/\s+$/g, "");
  if (!text) {
    if (e.existed) editor.deleteText(e.pageId, e.id);
  } else {
    const off = pageOffset(e.pageId);
    editor.commitText({
      id: e.id,
      pageId: e.pageId,
      x: e.x - off.x,
      y: e.y - off.y,
      text,
      color: e.color,
      size: e.size,
      createdAt: Date.now(),
    });
  }
  dirtyBase = true;
  schedule();
}

function handleDown(s: InputSample) {
  if (panActive || pinchActive) return;
  // Commit a focused field (e.g. the project name) when drawing starts; the
  // canvas swallows the focus change otherwise so its blur never fires.
  const active = document.activeElement as HTMLElement | null;
  if (
    active &&
    active !== textInput.value &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA")
  ) {
    active.blur();
  }
  const w = toWorld(s.x, s.y);
  // Resolve which sheet this gesture targets and its page-local origin. Free mode
  // treats the whole canvas as one surface (offset 0).
  let targetPageId = props.page.id;
  let onSheet = !isNotebook();
  drawOffsetX = 0;
  drawOffsetY = 0;
  if (isNotebook()) {
    const hit = worldToSheet(w.x, w.y, editor.pages.length, editor.notebookLayout);
    // Drawing/text only land on a sheet, never in the gaps between them.
    if (!hit && editor.tool !== "eraser") return;
    if (hit) {
      onSheet = true;
      targetPageId = editor.pages[hit.index].id;
      const o = sheetWorldPos(hit.index, editor.notebookLayout);
      drawOffsetX = o.x;
      drawOffsetY = o.y;
    }
  }
  if (editor.tool === "text") {
    if (editing.value) commitEditing();
    const page = editor.pages.find((p) => p.id === targetPageId) ?? props.page;
    const existing = (page.texts ?? []).find((t) => hitText(t, w.x, w.y));
    if (existing) {
      // Drag to move, or tap (no move) to edit — decided in move/up.
      textDrag = {
        item: existing,
        downX: w.x,
        downY: w.y,
        origX: existing.x,
        origY: existing.y,
        moved: false,
      };
    } else {
      beginTextAt(w.x, w.y, undefined, targetPageId);
    }
    return;
  }
  editor.setDrawing(true);
  if (editor.tool === "eraser") {
    isErasing = true;
    eraseCursor.value = { x: s.x, y: s.y };
    eraseLockId = onSheet ? targetPageId : undefined;
    eraseOffX = drawOffsetX;
    eraseOffY = drawOffsetY;
    if (editor.eraserMode === "area" && eraseLockId) editor.beginAreaErase(eraseLockId);
    eraseAt(w.x, w.y);
    return;
  }
  const point = toPagePoint(s);
  currentStroke = {
    id: newId(),
    pageId: targetPageId,
    tool: editor.tool,
    ...(editor.tool === "pen" ? { penType: editor.penType } : {}),
    color: editor.color,
    size: editor.size,
    opacity: editor.tool === "highlighter" ? 0.35 : editor.opacity,
    points: [point],
    createdAt: Date.now(),
  };
  liveSendCursor = 0;
  if (live.mode === "host") {
    live.broadcast({ t: "stroke-begin", stroke: { ...currentStroke, points: [point] } });
    liveSendCursor = 1;
  }
  schedule();
}

function handleMove(samples: InputSample[]) {
  if (panActive || pinchActive) return;
  if (editor.notebookMode === "strict" && currentStroke) {
    if (strictBlocked) {
      predictedPoints = [];
      schedule();
      return;
    }
    predictedPoints = [];
    for (const pt of samples) {
      const lp = toPagePoint(pt);
      if (!isInSheet(lp.x, lp.y)) {
        // Stroke is leaving the sheet — end it exactly on the boundary.
        const prev = currentStroke.points[currentStroke.points.length - 1];
        if (prev && isInSheet(prev.x, prev.y)) {
          const edge = clampToSheetBoundary(prev, lp);
          currentStroke.points.push({ x: edge.x, y: edge.y, p: pt.pressure, t: pt.t });
        }
        strictBlocked = true;
        break;
      }
      currentStroke.points.push(lp);
    }
    schedule();
    return;
  }
  if (textDrag) {
    const s = samples[samples.length - 1];
    const w = toWorld(s.x, s.y);
    const dx = w.x - textDrag.downX;
    const dy = w.y - textDrag.downY;
    if (!textDrag.moved && Math.hypot(dx, dy) * cam.zoom > 4) textDrag.moved = true;
    if (textDrag.moved) {
      textDrag.item.x = textDrag.origX + dx;
      textDrag.item.y = textDrag.origY + dy;
      dirtyBase = true;
      schedule();
    }
    return;
  }
  if (isErasing) {
    const last = samples[samples.length - 1];
    eraseCursor.value = { x: last.x, y: last.y };
    for (const s of samples) {
      const w = toWorld(s.x, s.y);
      eraseAt(w.x, w.y);
    }
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  for (const s of samples) currentStroke.points.push(toPagePoint(s));
  schedule();
}

function handlePredict(samples: InputSample[]) {
  if (!currentStroke || panActive || pinchActive) return;
  if (editor.notebookMode === "strict") {
    if (strictBlocked) {
      predictedPoints = [];
      schedule();
      return;
    }
    const pts: StrokePoint[] = [];
    let prev: StrokePoint | undefined = currentStroke.points[currentStroke.points.length - 1];
    for (const s of samples) {
      const lp = toPagePoint(s);
      if (!isInSheet(lp.x, lp.y)) {
        if (prev && isInSheet(prev.x, prev.y)) {
          const edge = clampToSheetBoundary(prev, lp);
          pts.push({ x: edge.x, y: edge.y, p: s.pressure, t: s.t });
        }
        break;
      }
      pts.push(lp);
      prev = lp;
    }
    predictedPoints = pts;
    schedule();
    return;
  }
  predictedPoints = samples.map(toPagePoint);
  schedule();
}

function appendFinalPoint(stroke: Stroke, sample?: InputSample) {
  if (!sample) return;
  const point = toPagePoint(sample);
  const last = stroke.points[stroke.points.length - 1];
  if (!last) {
    stroke.points.push(point);
    return;
  }
  if (last.x !== point.x || last.y !== point.y) {
    stroke.points.push(point);
    return;
  }
  if (stroke.points.length === 1) {
    stroke.points.push({ ...point, x: point.x + 0.0001, y: point.y + 0.0001 });
  }
}

// Append the final pointer sample, respecting the strict-mode boundary: if the
// pointer is released outside the page and the crossing was not already clamped
// during the move, end the stroke on the boundary instead of dropping the point.
function appendStrictAwareFinalPoint(
  stroke: Stroke,
  sample: InputSample | undefined,
  alreadyClamped: boolean,
) {
  if (!sample) return;
  if (editor.notebookMode === "strict" && strictFinalSampleOutOfBounds(sample)) {
    if (alreadyClamped) return;
    const lp = toPagePoint(sample);
    const prev = stroke.points[stroke.points.length - 1];
    if (prev && isInSheet(prev.x, prev.y)) {
      const edge = clampToSheetBoundary(prev, lp);
      stroke.points.push({ x: edge.x, y: edge.y, p: sample.pressure, t: sample.t });
    }
    return;
  }
  appendFinalPoint(stroke, sample);
}

async function handleUp(sample?: InputSample) {
  const wasStrictBlocked = strictBlocked;
  strictBlocked = false;
  if (textDrag) {
    const d = textDrag;
    textDrag = null;
    if (d.moved) {
      editor.commitText({ ...d.item });
      dirtyBase = true;
      schedule();
    } else {
      beginTextAt(d.item.x, d.item.y, d.item);
    }
    return;
  }
  editor.setDrawing(false);
  if (isErasing) {
    isErasing = false;
    eraseCursor.value = null;
    if (areaErased) {
      areaErased = false;
      editor.flushPage(eraseLockId ?? props.page.id);
    }
    eraseLockId = undefined;
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  appendStrictAwareFinalPoint(currentStroke, sample, wasStrictBlocked);
  const finished = currentStroke;
  currentStroke = undefined;
  liveSendCursor = 0;
  dirtyBase = true;
  schedule();
  await editor.commitStroke(finished);
}

async function handleCancel(sample?: InputSample) {
  const wasStrictBlocked = strictBlocked;
  strictBlocked = false;
  if (textDrag) {
    if (textDrag.moved) editor.commitText({ ...textDrag.item });
    textDrag = null;
    dirtyBase = true;
    schedule();
    return;
  }
  editor.setDrawing(false);
  if (isErasing) {
    isErasing = false;
    eraseCursor.value = null;
    if (areaErased) {
      areaErased = false;
      editor.flushPage(eraseLockId ?? props.page.id);
    }
    eraseLockId = undefined;
    return;
  }
  if (!currentStroke) return;
  predictedPoints = [];
  appendStrictAwareFinalPoint(currentStroke, sample, wasStrictBlocked);
  if (currentStroke.points.length >= 2) {
    const partial = currentStroke;
    currentStroke = undefined;
    liveSendCursor = 0;
    dirtyBase = true;
    schedule();
    await editor.commitStroke(partial);
  } else {
    if (live.mode === "host") {
      live.broadcast({
        t: "stroke-cancel",
        pageId: currentStroke.pageId,
        strokeId: currentStroke.id,
      });
    }
    currentStroke = undefined;
    liveSendCursor = 0;
    schedule();
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (!wrap.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  if (e.ctrlKey || e.metaKey) {
    zoomAt(sx, sy, Math.exp(-e.deltaY / 300));
  } else {
    panBy(-e.deltaX, -e.deltaY);
  }
}

function onNavPointerDown(e: PointerEvent) {
  if (e.pointerType === "touch") {
    if (!wrap.value) return;
    const rect = wrap.value.getBoundingClientRect();
    touchPoints.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (touchPoints.size >= 2) {
      if (currentStroke || isErasing) return;
      e.preventDefault();
      const pts = Array.from(touchPoints.values());
      pinchLastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchLastMx = (pts[0].x + pts[1].x) / 2;
      pinchLastMy = (pts[0].y + pts[1].y) / 2;
      if (!pinchActive) {
        pinchActive = true;
        isErasing = false;
      }
    }
    return;
  }
  if (e.pointerType === "pen" && pinchActive) {
    pinchActive = false;
    pinchLastDist = 0;
    touchPoints.clear();
  }
  // Middle mouse or space + left drag
  if (e.button === 1 || (e.button === 0 && spaceHeld)) {
    e.preventDefault();
    panActive = true;
    panCursor.value = true;
    panPointerId = e.pointerId;
    panLastX = e.clientX;
    panLastY = e.clientY;
    wrap.value?.setPointerCapture(e.pointerId);
  }
}

function onNavPointerMove(e: PointerEvent) {
  if (e.pointerType === "touch") {
    if (!wrap.value) return;
    const rect = wrap.value.getBoundingClientRect();
    touchPoints.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (!pinchActive || touchPoints.size < 2) return;
    e.preventDefault();
    const pts = Array.from(touchPoints.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mx = (pts[0].x + pts[1].x) / 2;
    const my = (pts[0].y + pts[1].y) / 2;
    if (pinchLastDist > 0) zoomAt(pinchLastMx, pinchLastMy, dist / pinchLastDist);
    panBy(mx - pinchLastMx, my - pinchLastMy);
    pinchLastDist = dist;
    pinchLastMx = mx;
    pinchLastMy = my;
    return;
  }
  if (!panActive || panPointerId !== e.pointerId) return;
  panBy(e.clientX - panLastX, e.clientY - panLastY);
  panLastX = e.clientX;
  panLastY = e.clientY;
}

function onNavPointerUp(e: PointerEvent) {
  if (e.pointerType === "touch") {
    touchPoints.delete(e.pointerId);
    if (touchPoints.size < 2) {
      pinchActive = false;
      pinchLastDist = 0;
    }
    return;
  }
  if (panActive && panPointerId === e.pointerId) {
    panActive = false;
    panCursor.value = spaceHeld;
    panPointerId = undefined;
    try {
      wrap.value?.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore DOMException if already released
    }
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
  if (e.code === "Space") {
    e.preventDefault();
    spaceHeld = true;
    panCursor.value = true;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === "Space") {
    spaceHeld = false;
    panActive = false;
    panCursor.value = false;
  }
}

// ── Watchers ───────────────────────────────────────────────────────────────

watch(
  () => editor.strokes.length,
  () => {
    dirtyBase = true;
    schedule();
  },
);
watch(
  () => props.page.id,
  () => {
    // In notebook mode props.page is the active sheet, which changes as you
    // scroll — that's not a page switch, so don't disturb the camera or editor.
    if (isNotebook()) return;
    commitEditing();
    updatePageOverlay();
    dirtyBase = true;
    schedule();
  },
);
// Repaint when any sheet's content changes (texts, background, order, add/delete).
watch(
  () => editor.pages,
  () => {
    updatePageOverlay();
    dirtyBase = true;
    schedule();
  },
  { deep: true },
);
watch(
  () => editor.notebookMode,
  (mode, prev) => {
    if (mode !== "off" && prev === "off" && editor.currentPageId) {
      centerOnSheet(editor.currentPageId);
    }
    updatePageOverlay();
    dirtyBase = true;
    schedule();
  },
);
// Switching tiling direction moves every sheet — re-fit on the active one.
watch(
  () => editor.notebookLayout,
  () => {
    if (editor.currentPageId) centerOnSheet(editor.currentPageId);
    updatePageOverlay();
    dirtyBase = true;
    schedule();
  },
);
// Overview-panel clicks ask the canvas to scroll to a sheet.
watch(
  () => editor.scrollRequestNonce,
  () => {
    if (editor.scrollRequestPageId) scrollToSheet(editor.scrollRequestPageId);
  },
);

// ── Lifecycle ──────────────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  if (!baseEl.value || !liveEl.value || !wrap.value) return;
  baseRenderer.attach(baseEl.value);
  liveRenderer.attach(liveEl.value);
  applyInkAdapter();
  if (wrap.value) sheetColors = resolveSheetColors(wrap.value);
  fitCanvas();
  // A project saved in notebook mode opens centered/fit on its first sheet.
  if (isNotebook() && editor.currentPageId) centerOnSheet(editor.currentPageId);
  else updatePageOverlay();
  wrap.value.addEventListener("wheel", onWheel, { passive: false });
  wrap.value.addEventListener("pointerdown", onNavPointerDown, { capture: true, passive: false });
  wrap.value.addEventListener("pointermove", onNavPointerMove, { capture: true, passive: false });
  wrap.value.addEventListener("pointerup", onNavPointerUp, { capture: true });
  wrap.value.addEventListener("pointercancel", onNavPointerUp, { capture: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  input.start(liveEl.value, {
    onDown: handleDown,
    onMove: handleMove,
    onUp: handleUp,
    onCancel: handleCancel,
    onPredict: handlePredict,
  });
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
});

// Re-paint ink when the theme flips (dark-mode ink adaptation is render-time).
watch(isDark, () => {
  applyInkAdapter();
  if (wrap.value) sheetColors = resolveSheetColors(wrap.value);
  updateEditStyle();
  dirtyBase = true;
  schedule();
});

onBeforeUnmount(() => {
  commitEditing();
  input.stop();
  if (wrap.value) {
    wrap.value.removeEventListener("wheel", onWheel);
    wrap.value.removeEventListener("pointerdown", onNavPointerDown, true);
    wrap.value.removeEventListener("pointermove", onNavPointerMove, true);
    wrap.value.removeEventListener("pointerup", onNavPointerUp, true);
    wrap.value.removeEventListener("pointercancel", onNavPointerUp, true);
  }
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="stage" ref="wrap" :class="{ 'pan-cursor': panCursor, 'is-notebook': editor.notebookMode !== 'off' }">
    <div v-if="editor.notebookMode === 'off'" class="page-bg" :class="`bg-${props.page.background}`" :style="bgStyle" aria-hidden="true"></div>
    <canvas ref="baseEl" class="layer base"></canvas>
    <canvas ref="liveEl" class="layer live"></canvas>
    <textarea
      v-if="editing"
      ref="textInput"
      v-model="editing.text"
      class="text-edit"
      :style="editStyle"
      rows="1"
      spellcheck="false"
      placeholder="Type..."
      @input="autosizeText"
      @pointerdown="onEditPointerDown"
      @blur="commitEditing"
      @keydown.escape.prevent="commitEditing"
      @keydown.enter.exact.prevent="commitEditing"
    ></textarea>
    <template v-if="editor.notebookMode !== 'off'">
      <div
        v-for="f in sheetFrames"
        :key="f.id"
        class="page-frame"
        :class="{ 'is-strict': editor.notebookMode === 'strict', 'is-active': f.active }"
        :style="{ left: `${f.left}px`, top: `${f.top}px`, width: `${f.width}px`, height: `${f.height}px` }"
        aria-hidden="true"
      ></div>
    </template>
    <div
      v-if="eraseCursor"
      class="eraser-cursor"
      :class="editor.eraserShape"
      :style="{ left: `${eraseCursor.x}px`, top: `${eraseCursor.y}px`, width: `${editor.size * 2}px`, height: `${editor.size * 2}px` }"
    ></div>
    <div class="cam-controls">
      <button class="cam-btn" title="Zoom out" @click="zoomOut">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M5 12h14"/>
        </svg>
      </button>
      <button class="cam-btn cam-zoom-label" title="Reset view" @click="resetView">
        {{ zoomLabel }}
      </button>
      <button class="cam-btn" title="Zoom in" @click="zoomIn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--color-canvas-surface);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.stage.pan-cursor {
  cursor: grab;
}

.stage.pan-cursor:active {
  cursor: grabbing;
}

/* Notebook mode: a neutral "desk" backdrop behind the white A4 sheets. */
.stage.is-notebook {
  background: var(--color-bg);
}

.page-bg {
  position: absolute;
  inset: 0;
  background-color: var(--color-canvas-surface);
  background-repeat: repeat;
  pointer-events: none;
}

.bg-ruled {
  background-image: linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(100% - 1px),
    var(--color-canvas-line) calc(100% - 1px),
    var(--color-canvas-line) 100%
  );
}

.bg-grid {
  background-image:
    linear-gradient(to right, transparent calc(100% - 1px), var(--color-canvas-line) calc(100% - 1px), var(--color-canvas-line) 100%),
    linear-gradient(to bottom, transparent calc(100% - 1px), var(--color-canvas-line) calc(100% - 1px), var(--color-canvas-line) 100%);
}

.bg-dotted {
  background-image: radial-gradient(circle at 50% 50%, var(--color-canvas-dot) 1.5px, transparent 2.5px);
}

.layer {
  position: absolute;
  inset: 0;
  display: block;
  background: transparent;
  forced-color-adjust: none;
}

.live {
  touch-action: none;
}

/* Notebook sheets: a soft drop shadow lifts each A4 page off the desk backdrop. */
.page-frame {
  position: absolute;
  z-index: 3;
  pointer-events: none;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.12);
}

.page-frame.is-active {
  border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
  box-shadow: 0 3px 16px rgba(15, 23, 42, 0.16);
}

.page-frame.is-strict {
  border-style: solid;
  border-color: color-mix(in srgb, #f59e0b 70%, transparent);
}

.eraser-cursor {
  position: absolute;
  z-index: 6;
  transform: translate(-50%, -50%);
  border: 1.5px solid var(--color-ink);
  background: var(--color-ink-fill);
  pointer-events: none;
}
.eraser-cursor.circle { border-radius: 50%; }
.eraser-cursor.square { border-radius: 3px; }

.text-edit {
  position: absolute;
  z-index: 6;
  margin: -4px 0 0 -6px;
  padding: 2px 5px;
  border: 1.5px dashed var(--color-accent, #3b82f6);
  border-radius: 6px;
  background: var(--color-glass-bg);
  box-shadow: 0 2px 10px var(--color-glass-shadow);
  outline: none;
  resize: none;
  overflow: hidden;
  white-space: pre;
  line-height: 1.3;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  transform-origin: top left;
  min-width: 8px;
  min-height: 1.3em;
}

.cam-controls {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 12px;
  padding: 4px;
  box-shadow: 0 8px 24px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
  z-index: 5;
  transition: opacity 150ms ease;
}

.cam-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}

.cam-btn:active {
  transform: scale(0.94);
}

.cam-zoom-label {
  font-size: var(--text-xs);
  font-weight: 600;
  min-width: 52px;
  letter-spacing: 0.02em;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.cam-btn:hover {
  background: rgba(15, 23, 42, 0.07);
}
</style>
