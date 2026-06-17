import { getStroke } from "perfect-freehand";
import { ref } from "vue";
import { storage } from "@/adapters/storage/indexedDB";
import { useTheme } from "@/composables/useTheme";
import { splitImageLayers } from "@/core/images";
import { adaptInk } from "@/core/ink";
import type { ImageItem, Page, Project, Shape, Stroke, TextItem } from "@/core/types";

// Read the active theme so thumbnails match the editor: dark paper + light-flipped
// ink in dark mode, exactly like the live canvas (paper from --color-canvas-surface,
// ink through adaptInk). isDark comes from useTheme so it tracks system mode too,
// where no data-theme attribute is set. Falls back to a white sheet headlessly.
const { isDark: themeIsDark } = useTheme();

function themeColors(): { paper: string; isDark: boolean } {
  if (typeof document === "undefined") return { paper: "#ffffff", isDark: false };
  const paper = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-canvas-surface")
    .trim();
  return { paper: paper || "#ffffff", isDark: themeIsDark.value };
}

// Page panel thumbnails: A4 ratio, contain mode
const THUMB_W = 52;
const THUMB_H = 74;

// Project card thumbnails: 4:3 card ratio
const PROJ_W = 480;
const PROJ_H = 360;

const PEN_OPTIONS = {
  size: 1,
  thinning: 0.55,
  smoothing: 0.55,
  streamline: 0.32,
  easing: (t: number) => t,
  simulatePressure: false,
  start: { taper: 0, cap: true },
  end: { taper: 20, cap: true },
};

// pageId → data URL (used in the pages panel)
const thumbnails = ref<Record<string, string>>({});
// projectId → data URL (used on the projects landing page)
const projectThumbnails = ref<Record<string, string>>({});

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function contentBounds(
  pageStrokes: Stroke[],
  texts: TextItem[],
  shapes: Shape[],
  images: ImageItem[],
): Bounds | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const stroke of pageStrokes) {
    for (const pt of stroke.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  for (const img of images) {
    if (img.x < minX) minX = img.x;
    if (img.y < minY) minY = img.y;
    if (img.x + img.width > maxX) maxX = img.x + img.width;
    if (img.y + img.height > maxY) maxY = img.y + img.height;
  }
  for (const sh of shapes) {
    const sx = Math.min(sh.x1, sh.x2);
    const sy = Math.min(sh.y1, sh.y2);
    const ex = Math.max(sh.x1, sh.x2);
    const ey = Math.max(sh.y1, sh.y2);
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
    if (ex > maxX) maxX = ex;
    if (ey > maxY) maxY = ey;
  }
  for (const item of texts) {
    if (!item.text) continue;
    const lines = item.text.split("\n");
    const charW = item.size * 0.6;
    const lineH = item.size * 1.3;
    const textW = Math.max(...lines.map((l) => l.length * charW));
    const textH = lines.length * lineH;
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + textW > maxX) maxX = item.x + textW;
    if (item.y + textH > maxY) maxY = item.y + textH;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function drawShape(ctx: OffscreenCanvasRenderingContext2D, shape: Shape, isDark: boolean): void {
  ctx.save();
  ctx.strokeStyle = adaptInk(shape.color, isDark);
  ctx.lineWidth = shape.size;
  ctx.globalAlpha = shape.opacity;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const { x1, y1, x2, y2 } = shape;
  ctx.beginPath();
  if (shape.type === "rect") {
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (shape.type === "ellipse") {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    if (rx > 0 && ry > 0) ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else if (shape.type === "line") {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  } else if (shape.type === "arrow") {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, shape.size * 5);
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6),
    );
  }
  ctx.stroke();
  ctx.restore();
}

async function drawImageToCtx(
  ctx: OffscreenCanvasRenderingContext2D,
  item: ImageItem,
): Promise<void> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = item.src;
    });
    ctx.drawImage(img, item.x, item.y, item.width, item.height);
  } catch {
    // Skip undecodable images silently.
  }
}

async function renderToCanvas(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[],
  images: ImageItem[],
  w: number,
  h: number,
): Promise<string | null> {
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const pageShapes = shapes.filter((s) => s.pageId === page.id);
  const pageImages = images.filter((i) => i.pageId === page.id);
  const texts = page.texts ?? [];

  const { paper, isDark } = themeColors();

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  const bounds = contentBounds(pageStrokes, texts, pageShapes, pageImages);

  let scale: number;
  let offsetX: number;
  let offsetY: number;

  if (!bounds) {
    // No content — show the top-left of the page at natural scale. A "no page
    // size" page (0×0) has no dimensions to fit, so fall back to the A4 ratio.
    const pw = page.width || 1240;
    const ph = page.height || 1754;
    scale = Math.min(w / pw, h / ph);
    offsetX = 0;
    offsetY = 0;
  } else {
    // Pad by stroke width + a fixed margin so no ink is clipped at edges.
    const maxSize = pageStrokes.reduce((m, s) => Math.max(m, s.size), 10);
    const pad = maxSize * 2 + 24;
    const bx = bounds.minX - pad;
    const by = bounds.minY - pad;
    const bw = bounds.maxX - bounds.minX + pad * 2;
    const bh = bounds.maxY - bounds.minY + pad * 2;

    // Contain the bounding box, centered in the thumbnail.
    scale = Math.min(w / bw, h / bh);
    offsetX = (w - bw * scale) / 2 - bx * scale;
    offsetY = (h - bh * scale) / 2 - by * scale;
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Images split into behind/front bands, matching the canvas + export layer order.
  const { behind: behindImgs, front: frontImgs } = splitImageLayers(pageImages);
  for (const img of behindImgs) await drawImageToCtx(ctx, img);

  for (const stroke of pageStrokes) {
    if (stroke.points.length === 0) continue;
    const inputs = stroke.points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
    const path = getStroke(inputs, { ...PEN_OPTIONS, size: stroke.size, last: true });
    if (!path.length) continue;
    ctx.fillStyle = adaptInk(stroke.color, isDark);
    ctx.globalAlpha = stroke.opacity;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length - 1; i++) {
      const mx = (path[i][0] + path[i + 1][0]) / 2;
      const my = (path[i][1] + path[i + 1][1]) / 2;
      ctx.quadraticCurveTo(path[i][0], path[i][1], mx, my);
    }
    if (path.length > 1) ctx.lineTo(path[path.length - 1][0], path[path.length - 1][1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const shape of pageShapes) drawShape(ctx, shape, isDark);

  for (const item of texts) {
    if (!item.text) continue;
    ctx.save();
    ctx.fillStyle = adaptInk(item.color, isDark);
    ctx.font = `${item.size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    const lineHeight = item.size * 1.3;
    const lines = item.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], item.x, item.y + i * lineHeight);
    }
    ctx.restore();
  }

  for (const img of frontImgs) await drawImageToCtx(ctx, img);

  ctx.restore();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return blobToDataUrl(blob);
}

async function renderThumbnail(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[] = [],
  images: ImageItem[] = [],
): Promise<void> {
  const url = await renderToCanvas(page, strokes, shapes, images, THUMB_W, THUMB_H);
  if (url) thumbnails.value[page.id] = url;
}

async function loadAndRenderThumbnail(page: Page): Promise<void> {
  const [strokes, shapes, images] = await Promise.all([
    storage.listStrokes(page.id),
    storage.listShapes(page.id),
    storage.listImages(page.id),
  ]);
  await renderThumbnail(page, strokes, shapes, images);
}

async function renderProjectThumbnail(project: Project): Promise<void> {
  const pages = await storage.listPages(project.id);
  if (!pages.length) return;
  const firstPage = pages[0];
  const [strokes, shapes, images] = await Promise.all([
    storage.listStrokes(firstPage.id),
    storage.listShapes(firstPage.id),
    storage.listImages(firstPage.id),
  ]);
  const url = await renderToCanvas(firstPage, strokes, shapes, images, PROJ_W, PROJ_H);
  if (url) projectThumbnails.value[project.id] = url;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export function useThumbnails() {
  return {
    thumbnails,
    projectThumbnails,
    renderThumbnail,
    loadAndRenderThumbnail,
    renderProjectThumbnail,
  };
}
