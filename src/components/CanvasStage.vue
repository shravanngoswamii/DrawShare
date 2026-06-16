<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PointerInputAdapter } from "@/adapters/input/pointerInput";
import { Canvas2DRenderer } from "@/adapters/render/canvas2d";
import { drawStack, resolveSheetColors, type SheetColors } from "@/composables/useStackRenderer";
import { useTheme } from "@/composables/useTheme";
import { newId } from "@/core/ids";
import { splitImageLayers } from "@/core/images";
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
import { shapeSegments } from "@/core/shapes";
import type {
  ImageItem,
  Page,
  Shape,
  ShapeType,
  Stroke,
  StrokePoint,
  TextItem,
  Tool,
} from "@/core/types";
import { dlog } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const SHAPE_TOOLS = new Set<Tool>(["rect", "ellipse", "line", "arrow"]);
function isShapeTool(t: Tool): t is ShapeType {
  return SHAPE_TOOLS.has(t);
}

type ResizeCorner = "nw" | "ne" | "sw" | "se";

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
const pageFrameStyle = ref<Record<string, string> | null>(null);

function updatePageFrame() {
  const { width, height } = props.page;
  // The page-boundary frame is a Free-mode affordance; notebook mode draws its
  // own fixed A4 sheet frames instead, so hide it there.
  if (!width || !height || editor.notebookMode !== "off") {
    pageFrameStyle.value = null;
    return;
  }
  pageFrameStyle.value = {
    left: `${(0 - cam.x) * cam.zoom}px`,
    top: `${(0 - cam.y) * cam.zoom}px`,
    width: `${width * cam.zoom}px`,
    height: `${height * cam.zoom}px`,
  };
}

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

// Image selection ring + floating action bar (screen coords, kept in sync by
// updateImageSelStyle). The ring carries resize handles; the bar carries the
// stacking + delete actions.
const imageSelStyle = ref<Record<string, string> | null>(null);
const imageBarStyle = ref<Record<string, string> | null>(null);

// Hit radius (screen px) for grabbing a resize handle near an image corner.
const RESIZE_HANDLE_PX = 14;

function updateImageSelStyle() {
  const id = selectedImageId.value;
  const img = id ? editor.images.find((i) => i.id === id) : undefined;
  if (!img) {
    imageSelStyle.value = null;
    imageBarStyle.value = null;
    return;
  }
  // Shift page-local coords to world by the sheet origin (0,0 in Free mode).
  const off = pageOffset(img.pageId);
  const left = (img.x + off.x - cam.x) * cam.zoom;
  const top = (img.y + off.y - cam.y) * cam.zoom;
  imageSelStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${img.width * cam.zoom}px`,
    height: `${img.height * cam.zoom}px`,
  };
  // Action bar floats just above the top-left of the selection.
  imageBarStyle.value = { left: `${left}px`, top: `${top - 40}px` };
}

// If the world point sits on a resize handle of the given image, return which
// corner ("nw"/"ne"/"sw"/"se"), else null. Handles extend a few screen px around
// each corner regardless of zoom.
function imageResizeCornerAt(img: ImageItem, wx: number, wy: number): ResizeCorner | null {
  const off = pageOffset(img.pageId);
  const x0 = img.x + off.x;
  const y0 = img.y + off.y;
  const x1 = x0 + img.width;
  const y1 = y0 + img.height;
  const r = RESIZE_HANDLE_PX / cam.zoom;
  const near = (px: number, py: number) => Math.abs(wx - px) <= r && Math.abs(wy - py) <= r;
  if (near(x0, y0)) return "nw";
  if (near(x1, y0)) return "ne";
  if (near(x0, y1)) return "sw";
  if (near(x1, y1)) return "se";
  return null;
}

async function bringSelectedImageToFront() {
  const id = selectedImageId.value;
  if (!id) return;
  await editor.bringImageToFront(id);
  dirtyBase = true;
  schedule();
}

async function sendSelectedImageToBack() {
  const id = selectedImageId.value;
  if (!id) return;
  await editor.sendImageToBack(id);
  dirtyBase = true;
  schedule();
}

function deleteSelectedImage() {
  const id = selectedImageId.value;
  if (!id) return;
  selectedImageId.value = null;
  baseRenderer.releaseImage(id);
  editor.deleteImage(id);
  dirtyBase = true;
  schedule();
}

// Eraser cursor overlay (screen coords relative to the stage)
const eraseCursor = ref<{ x: number; y: number } | null>(null);

let currentStroke: Stroke | undefined;
let currentShape: Shape | undefined;
let isErasing = false;
let lastEraseWorld: { x: number; y: number } | null = null;
let textDrag: {
  item: TextItem;
  downX: number;
  downY: number;
  origX: number;
  origY: number;
  moved: boolean;
} | null = null;
let imageDrag: {
  item: ImageItem;
  downX: number;
  downY: number;
  origX: number;
  origY: number;
  moved: boolean;
} | null = null;
// In-progress corner resize of the selected image. orig* is the page-local rect at
// grab time; the opposite corner stays anchored and aspect ratio is preserved.
let imageResize: {
  item: ImageItem;
  corner: ResizeCorner;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
} | null = null;
const selectedImageId = ref<string | null>(null);
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

// ── Image helpers ──────────────────────────────────────────────────────────

function hitImage(img: ImageItem, wx: number, wy: number): boolean {
  // Images are page-local in notebook mode; shift to world by the sheet origin
  // (0,0 in Free mode) before testing against the world pointer.
  const off = pageOffset(img.pageId);
  const ix = img.x + off.x;
  const iy = img.y + off.y;
  return wx >= ix && wx <= ix + img.width && wy >= iy && wy <= iy + img.height;
}

async function placeImageFile(file: File, worldX?: number, worldY?: number): Promise<void> {
  const src = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((res) => {
    img.onload = () => res();
    img.onerror = () => res();
    img.src = src;
  });

  let nw = img.naturalWidth || 400;
  let nh = img.naturalHeight || 300;

  // Compress if too large (keeps storage and potential sync payloads small)
  const MAX_PX = 1600;
  let finalSrc = src;
  if (nw > MAX_PX || nh > MAX_PX) {
    const scale = Math.min(MAX_PX / nw, MAX_PX / nh);
    nw = Math.round(nw * scale);
    nh = Math.round(nh * scale);
    const oc = new OffscreenCanvas(nw, nh);
    const octx = oc.getContext("2d")!;
    octx.drawImage(img, 0, 0, nw, nh);
    const blob = await oc.convertToBlob({ type: "image/webp", quality: 0.85 });
    finalSrc = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(blob);
    });
  }

  // Scale display size to fit ~50% of viewport min dimension in world coords
  const maxDim = (Math.min(viewW, viewH) / cam.zoom) * 0.5;
  const dispScale = Math.min(maxDim / nw, maxDim / nh, 1);
  const dispW = nw * dispScale;
  const dispH = nh * dispScale;

  // World point to place the image centre at (viewport centre if not dropped).
  const wcx = worldX ?? cam.x + viewW / (2 * cam.zoom);
  const wcy = worldY ?? cam.y + viewH / (2 * cam.zoom);

  // Route to a sheet and store page-local coords in notebook mode (offset 0 in
  // Free mode), mirroring how strokes/shapes are anchored to the active sheet.
  let targetPageId = props.page.id;
  let offX = 0;
  let offY = 0;
  if (isNotebook()) {
    const idx = nearestSheetIndex(wcx, wcy, editor.pages.length, editor.notebookLayout);
    targetPageId = editor.pages[idx].id;
    const o = sheetWorldPos(idx, editor.notebookLayout);
    offX = o.x;
    offY = o.y;
  }
  const cx = wcx - offX;
  const cy = wcy - offY;

  const imageItem: ImageItem = {
    id: newId(),
    pageId: targetPageId,
    x: cx - dispW / 2,
    y: cy - dispH / 2,
    width: dispW,
    height: dispH,
    src: finalSrc,
    createdAt: Date.now(),
  };

  await baseRenderer.loadImage(imageItem);
  await editor.commitImage(imageItem);
}

function triggerFileImport(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) placeImageFile(file);
  };
  input.click();
}

async function onPaste(e: ClipboardEvent): Promise<void> {
  const items = Array.from(e.clipboardData?.items ?? []);
  const imageEntry = items.find((it) => it.type.startsWith("image/"));
  if (!imageEntry) return;
  e.preventDefault();
  const blob = imageEntry.getAsFile();
  if (blob) await placeImageFile(blob);
}

function onDragOver(e: DragEvent): void {
  const hasImage = Array.from(e.dataTransfer?.items ?? []).some((it) =>
    it.type.startsWith("image/"),
  );
  if (hasImage) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
  }
}

async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (files.length === 0) return;
  const rect = wrap.value!.getBoundingClientRect();
  const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
  await placeImageFile(files[0], w.x, w.y);
}

defineExpose({ triggerFileImport });

// ── End image helpers ──────────────────────────────────────────────────────

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
  updateImageSelStyle();
  updatePageFrame();
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
  // viewW/viewH are stored before setViewport so culling uses updated dimensions
  baseRenderer.setViewport(viewW, viewH, ratio);
  liveRenderer.setViewport(viewW, viewH, ratio);
  // Apply current camera without resetting it
  baseRenderer.setCamera({ ...cam });
  liveRenderer.setCamera({ ...cam });
  live.setHostViewport(viewW, viewH);
  updateBg();
  updatePageOverlay();
  updatePageFrame();
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
        editor.shapes,
        editor.images,
        editor.notebookLayout,
        sheetColors,
        {
          range: visibleRange(),
          editingTextId: editing.value?.id,
          clip: editor.notebookMode === "strict",
        },
      );
    } else {
      baseRenderer.beginFrame();
      // Images split into a behind band (below the drawing) and a front band (above).
      const pageImgs = editor.images.filter((img) => img.pageId === props.page.id);
      const { behind, front } = splitImageLayers(pageImgs);
      for (const img of behind) baseRenderer.drawImageItem(img);
      for (const s of editor.strokes) baseRenderer.drawStroke(s);
      for (const sh of editor.shapes) baseRenderer.drawShape(sh);
      for (const t of editor.currentPage?.texts ?? []) {
        if (editing.value?.id === t.id) continue;
        baseRenderer.drawText(t);
      }
      for (const img of front) baseRenderer.drawImageItem(img);
      baseRenderer.endFrame();
    }
    dlog(`render base strokes=${editor.strokes.length} cur=${currentStroke ? "y" : "n"}`);
    dirtyBase = false;
  }
  liveRenderer.clear();
  if (currentShape) {
    // The in-progress shape is page-local; shift the live camera by the active
    // sheet origin (no-op in Free mode where drawOffset is 0).
    liveRenderer.setCamera({ x: cam.x - drawOffsetX, y: cam.y - drawOffsetY, zoom: cam.zoom });
    liveRenderer.beginFrame();
    const clipShape = editor.notebookMode === "strict";
    if (clipShape) liveRenderer.pushClip(PAGE_W, PAGE_H);
    liveRenderer.drawShape(currentShape);
    if (clipShape) liveRenderer.popClip();
    liveRenderer.endFrame();
  } else if (currentStroke && currentStroke.points.length > 0) {
    // The in-progress stroke is page-local; shift the live camera by the active
    // sheet origin so drawLive paints it at the sheet's world position (no-op in
    // Free mode where drawOffset is 0).
    liveRenderer.setCamera({ x: cam.x - drawOffsetX, y: cam.y - drawOffsetY, zoom: cam.zoom });
    liveRenderer.beginFrame();
    // Strict mode keeps the in-progress stroke inside its sheet; notebook mode
    // lets it show outside (matching the committed layer).
    const clipLive = editor.notebookMode === "strict";
    if (clipLive) liveRenderer.pushClip(PAGE_W, PAGE_H);
    if (predictedPoints.length > 0) {
      liveRenderer.drawLive({
        ...currentStroke,
        points: [...currentStroke.points, ...predictedPoints],
      });
    } else {
      liveRenderer.drawLive(currentStroke);
    }
    if (clipLive) liveRenderer.popClip();
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

// Stamp the eraser at wx,wy, then interpolate from lastEraseWorld to fill gaps
// created by fast pointer movement between frames.
function eraseStamp(wx: number, wy: number) {
  const r = editor.size / cam.zoom;
  if (lastEraseWorld) {
    const dx = wx - lastEraseWorld.x;
    const dy = wy - lastEraseWorld.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, r * 0.5);
    if (dist > step) {
      const n = Math.ceil(dist / step);
      for (let i = 1; i < n; i++) {
        eraseAt(lastEraseWorld.x + (dx * i) / n, lastEraseWorld.y + (dy * i) / n);
      }
    }
  }
  eraseAt(wx, wy);
  lastEraseWorld = { x: wx, y: wy };
}

// Hit-test the eraser circle against a shape's drawn outline (not its bounding
// box), reusing the shared outline-segment decomposition.
function shapeHitByEraser(s: Shape, lx: number, ly: number, r: number): boolean {
  for (const [ax, ay, bx, by] of shapeSegments(s)) {
    if (distToSegment(lx, ly, ax, ay, bx, by) < r) return true;
  }
  return false;
}

// Whole-delete any shape whose outline the eraser touches on the given sheet.
// Used by the "whole" eraser mode — a tap removes the entire shape.
function eraseShapesAt(pageId: string, lx: number, ly: number, r: number): boolean {
  const hit = editor.shapes.filter((s) => s.pageId === pageId && shapeHitByEraser(s, lx, ly, r));
  if (hit.length === 0) return false;
  for (const s of hit) editor.deleteShape(s.id);
  return true;
}

function eraseAt(wx: number, wy: number) {
  const r = editor.size / cam.zoom;
  // Area erase stays on the sheet it started on (keeps its snapshot coherent).
  if (editor.eraserMode === "area") {
    if (!eraseLockId) return;
    const lx = wx - eraseOffX;
    const ly = wy - eraseOffY;
    // Clip both ink and shape outlines under the eraser, so a sweep removes only
    // the swept part of a shape (survivors stay crisp lines, not pen-rasterized).
    let changed = editor.eraseArea(eraseLockId, lx, ly, r);
    if (editor.eraseAreaShapes(eraseLockId, lx, ly, r)) changed = true;
    if (changed) {
      areaErased = true;
      dirtyBase = true;
      schedule();
    }
    return;
  }
  // Stroke erase routes to a sheet and may cross sheets. Strict only erases on a
  // sheet; notebook uses the nearest sheet so gap ink is also erasable.
  let pageId = props.page.id;
  let lx = wx;
  let ly = wy;
  if (isNotebook()) {
    const count = editor.pages.length;
    let idx: number;
    if (editor.notebookMode === "strict") {
      const hit = worldToSheet(wx, wy, count, editor.notebookLayout);
      if (!hit) return;
      idx = hit.index;
    } else {
      idx = nearestSheetIndex(wx, wy, count, editor.notebookLayout);
    }
    pageId = editor.pages[idx].id;
    const o = sheetWorldPos(idx, editor.notebookLayout);
    lx = wx - o.x;
    ly = wy - o.y;
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
  for (const stroke of toDelete) editor.eraseStroke(stroke.id);
  const erasedShape = eraseShapesAt(pageId, lx, ly, r);
  if (toDelete.length === 0 && !erasedShape) return;
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
    const count = editor.pages.length;
    if (editor.notebookMode === "strict") {
      // Strict: drawing/text only land on a sheet, never in the gaps.
      const hit = worldToSheet(w.x, w.y, count, editor.notebookLayout);
      if (!hit && editor.tool !== "eraser") return;
      if (hit) {
        onSheet = true;
        targetPageId = editor.pages[hit.index].id;
        const o = sheetWorldPos(hit.index, editor.notebookLayout);
        drawOffsetX = o.x;
        drawOffsetY = o.y;
      }
    } else {
      // Notebook: the sheet is a guide — anchor the gesture to the nearest sheet
      // so you can draw anywhere, including the gaps, and see it.
      const idx = nearestSheetIndex(w.x, w.y, count, editor.notebookLayout);
      onSheet = true;
      targetPageId = editor.pages[idx].id;
      const o = sheetWorldPos(idx, editor.notebookLayout);
      drawOffsetX = o.x;
      drawOffsetY = o.y;
    }
  }
  if (editor.tool === "text") {
    if (editing.value) commitEditing();
    // Grabbing a corner handle of the already-selected image starts a resize.
    if (selectedImageId.value) {
      const sel = editor.images.find((i) => i.id === selectedImageId.value);
      const corner = sel ? imageResizeCornerAt(sel, w.x, w.y) : null;
      if (sel && corner) {
        imageResize = {
          item: sel,
          corner,
          origX: sel.x,
          origY: sel.y,
          origW: sel.width,
          origH: sel.height,
        };
        return;
      }
    }
    const page = editor.pages.find((p) => p.id === targetPageId) ?? props.page;
    const existing = (page.texts ?? []).find((t) => hitText(t, w.x, w.y));
    if (existing) {
      // Grabbing a text supersedes any image selection.
      selectedImageId.value = null;
      // Drag to move, or tap (no move) to edit — decided in move/up.
      textDrag = {
        item: existing,
        downX: w.x,
        downY: w.y,
        origX: existing.x,
        origY: existing.y,
        moved: false,
      };
      return;
    }
    // No text hit — an image (below text in z-order) is selectable/draggable in
    // the text tool. hitImage is sheet-offset-aware, so it works across sheets.
    const hitImg = editor.images.find((img) => hitImage(img, w.x, w.y));
    if (hitImg) {
      selectedImageId.value = hitImg.id;
      imageDrag = {
        item: hitImg,
        downX: w.x,
        downY: w.y,
        origX: hitImg.x,
        origY: hitImg.y,
        moved: false,
      };
      return;
    }
    selectedImageId.value = null;
    beginTextAt(w.x, w.y, undefined, targetPageId);
    return;
  }
  if (isShapeTool(editor.tool)) {
    // Page-local (relative to the active sheet); drawOffset is 0 in Free mode.
    const p = toPagePoint(s);
    currentShape = {
      id: newId(),
      pageId: targetPageId,
      type: editor.tool as ShapeType,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      color: editor.color,
      size: editor.size,
      opacity: editor.opacity,
      createdAt: Date.now(),
    };
    editor.setDrawing(true);
    schedule();
    return;
  }
  editor.setDrawing(true);
  if (editor.tool === "eraser") {
    isErasing = true;
    lastEraseWorld = null;
    eraseCursor.value = { x: s.x, y: s.y };
    eraseLockId = onSheet ? targetPageId : undefined;
    eraseOffX = drawOffsetX;
    eraseOffY = drawOffsetY;
    if (editor.eraserMode === "area" && eraseLockId) editor.beginAreaErase(eraseLockId);
    eraseStamp(w.x, w.y);
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
  if (imageResize) {
    const s = samples[samples.length - 1];
    const w = toWorld(s.x, s.y);
    const off = pageOffset(imageResize.item.pageId);
    // Pointer in page-local space; resize keeps aspect, anchoring the opposite corner.
    const plx = w.x - off.x;
    const ply = w.y - off.y;
    const { corner, origX, origY, origW, origH } = imageResize;
    const aspect = origW / origH;
    const anchorX = corner === "ne" || corner === "se" ? origX : origX + origW;
    const anchorY = corner === "sw" || corner === "se" ? origY : origY + origH;
    const MIN = 16;
    let newW = Math.max(MIN, Math.abs(plx - anchorX));
    let newH = Math.max(MIN, Math.abs(ply - anchorY));
    // Lock aspect to the axis dragged furthest, so the image never distorts.
    if (newW / newH > aspect) newH = newW / aspect;
    else newW = newH * aspect;
    const right = corner === "ne" || corner === "se";
    const bottom = corner === "sw" || corner === "se";
    imageResize.item.x = right ? anchorX : anchorX - newW;
    imageResize.item.y = bottom ? anchorY : anchorY - newH;
    imageResize.item.width = newW;
    imageResize.item.height = newH;
    updateImageSelStyle();
    dirtyBase = true;
    schedule();
    return;
  }
  if (imageDrag) {
    const s = samples[samples.length - 1];
    const w = toWorld(s.x, s.y);
    const dx = w.x - imageDrag.downX;
    const dy = w.y - imageDrag.downY;
    if (!imageDrag.moved && Math.hypot(dx, dy) * cam.zoom > 4) imageDrag.moved = true;
    if (imageDrag.moved) {
      imageDrag.item.x = imageDrag.origX + dx;
      imageDrag.item.y = imageDrag.origY + dy;
      updateImageSelStyle();
      dirtyBase = true;
      schedule();
    }
    return;
  }
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
      eraseStamp(w.x, w.y);
    }
    return;
  }
  if (currentShape) {
    const last = samples[samples.length - 1];
    const p = toPagePoint(last);
    currentShape.x2 = p.x;
    currentShape.y2 = p.y;
    schedule();
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
  if (imageResize) {
    const r = imageResize;
    imageResize = null;
    await editor.resizeImage(r.item.id, r.item.x, r.item.y, r.item.width, r.item.height);
    dirtyBase = true;
    schedule();
    return;
  }
  if (imageDrag) {
    const d = imageDrag;
    imageDrag = null;
    if (d.moved) {
      await editor.moveImage(d.item.id, d.item.x, d.item.y);
      dirtyBase = true;
      schedule();
    }
    return;
  }
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
    lastEraseWorld = null;
    eraseCursor.value = null;
    if (areaErased) {
      areaErased = false;
      editor.flushPage(eraseLockId ?? props.page.id);
    }
    eraseLockId = undefined;
    return;
  }
  if (currentShape) {
    editor.setDrawing(false);
    if (sample) {
      const p = toPagePoint(sample);
      currentShape.x2 = p.x;
      currentShape.y2 = p.y;
    }
    const minDist = 2 / cam.zoom;
    if (
      Math.abs(currentShape.x2 - currentShape.x1) > minDist ||
      Math.abs(currentShape.y2 - currentShape.y1) > minDist
    ) {
      await editor.commitShape({ ...currentShape });
    }
    currentShape = undefined;
    dirtyBase = true;
    schedule();
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
  if (imageResize) {
    // Revert to the rect captured at grab time.
    imageResize.item.x = imageResize.origX;
    imageResize.item.y = imageResize.origY;
    imageResize.item.width = imageResize.origW;
    imageResize.item.height = imageResize.origH;
    imageResize = null;
    updateImageSelStyle();
    dirtyBase = true;
    schedule();
    return;
  }
  if (imageDrag) {
    if (imageDrag.moved) {
      // Revert to original position
      imageDrag.item.x = imageDrag.origX;
      imageDrag.item.y = imageDrag.origY;
      dirtyBase = true;
      schedule();
    }
    imageDrag = null;
    return;
  }
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
    lastEraseWorld = null;
    eraseCursor.value = null;
    if (areaErased) {
      areaErased = false;
      editor.flushPage(eraseLockId ?? props.page.id);
    }
    eraseLockId = undefined;
    return;
  }
  if (currentShape) {
    editor.setDrawing(false);
    currentShape = undefined;
    schedule();
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
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    selectedImageId.value &&
    editor.tool === "text"
  ) {
    e.preventDefault();
    const id = selectedImageId.value;
    selectedImageId.value = null;
    baseRenderer.releaseImage(id);
    editor.deleteImage(id);
    dirtyBase = true;
    schedule();
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
  () => editor.images,
  async (imgs) => {
    // Reconcile the renderer's bitmap cache against the loaded set: free bitmaps
    // for images no longer present (deleted, page/project switch, undo) so they
    // don't leak, then preload any new ones. In notebook mode editor.images holds
    // all sheets' images; in Free mode it's just the current page's.
    baseRenderer.retainImages(new Set(imgs.map((i) => i.id)));
    await Promise.all(imgs.map((i) => baseRenderer.loadImage(i)));
    updateImageSelStyle();
    dirtyBase = true;
    schedule();
  },
  { deep: false },
);

watch(selectedImageId, () => updateImageSelStyle());

// Images are only selectable in the text tool; drop the selection (and its ring +
// Delete target) the moment the user switches to any other tool.
watch(
  () => editor.tool,
  (t) => {
    if (t !== "text") selectedImageId.value = null;
  },
);

watch(
  () => editor.shapes.length,
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
    selectedImageId.value = null;
    baseRenderer.clearBboxCache();
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
  () => [props.page.width, props.page.height] as const,
  () => {
    updatePageFrame();
    dirtyBase = true;
    schedule();
  },
);
// Entering/leaving notebook mode re-centres and re-frames the stack.
watch(
  () => editor.notebookMode,
  (mode, prev) => {
    if (mode !== "off" && prev === "off" && editor.currentPageId) {
      centerOnSheet(editor.currentPageId);
    }
    updatePageOverlay();
    updatePageFrame();
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

onMounted(async () => {
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
  wrap.value.addEventListener("dragover", onDragOver);
  wrap.value.addEventListener("drop", onDrop);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("paste", onPaste);
  input.start(liveEl.value, {
    onDown: handleDown,
    onMove: handleMove,
    onUp: handleUp,
    onCancel: handleCancel,
    onPredict: handlePredict,
  });
  resizeObserver = new ResizeObserver(() => fitCanvas());
  resizeObserver.observe(wrap.value);
  // Preload bitmaps for any already-loaded images (all sheets in notebook mode).
  if (editor.images.length > 0) {
    await Promise.all(editor.images.map((i) => baseRenderer.loadImage(i)));
    dirtyBase = true;
    schedule();
  }
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
    wrap.value.removeEventListener("dragover", onDragOver);
    wrap.value.removeEventListener("drop", onDrop);
  }
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("paste", onPaste);
  resizeObserver?.disconnect();
  // Free decoded ImageBitmaps so they don't outlive the editor.
  baseRenderer.clearImageCache();
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
      v-if="imageSelStyle"
      class="image-sel"
      :style="imageSelStyle"
      aria-hidden="true"
    >
      <span class="image-handle nw"></span>
      <span class="image-handle ne"></span>
      <span class="image-handle sw"></span>
      <span class="image-handle se"></span>
    </div>
    <div v-if="imageBarStyle" class="image-bar" :style="imageBarStyle" @pointerdown.stop>
      <button type="button" title="Send to back" @click="sendSelectedImageToBack">Back</button>
      <button type="button" title="Bring to front" @click="bringSelectedImageToFront">Front</button>
      <button type="button" class="danger" title="Delete image" @click="deleteSelectedImage">
        Delete
      </button>
    </div>
    <div
      v-if="eraseCursor"
      class="eraser-cursor"
      :class="editor.eraserShape"
      :style="{ left: `${eraseCursor.x}px`, top: `${eraseCursor.y}px`, width: `${editor.size * 2}px`, height: `${editor.size * 2}px` }"
    ></div>
    <div
      v-if="pageFrameStyle"
      class="page-size-frame"
      :style="pageFrameStyle"
      aria-hidden="true"
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

.image-sel {
  position: absolute;
  z-index: 5;
  border: 2px solid var(--color-accent, #3b82f6);
  border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25);
  pointer-events: none;
}

/* Corner resize handles — visual only; the grab is hit-tested on the canvas. */
.image-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 1.5px solid var(--color-accent, #3b82f6);
  border-radius: 2px;
}
.image-handle.nw { left: -6px; top: -6px; cursor: nwse-resize; }
.image-handle.ne { right: -6px; top: -6px; cursor: nesw-resize; }
.image-handle.sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
.image-handle.se { right: -6px; bottom: -6px; cursor: nwse-resize; }

/* Floating action bar above a selected image. */
.image-bar {
  position: absolute;
  z-index: 6;
  display: flex;
  gap: 2px;
  padding: 3px;
  transform: translateY(-2px);
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, rgba(148, 163, 184, 0.3));
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.28);
}
.image-bar button {
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text, #e2e8f0);
  cursor: pointer;
}
.image-bar button:hover { background: color-mix(in srgb, var(--color-accent) 22%, transparent); }
.image-bar button.danger:hover { background: color-mix(in srgb, #ef4444 24%, transparent); }

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

/* Free-mode page-size boundary (distinct from the notebook .page-frame sheets). */
.page-size-frame {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  border: 1px dashed var(--color-accent, #3b82f6);
  opacity: 0.3;
  border-radius: 1px;
}

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
