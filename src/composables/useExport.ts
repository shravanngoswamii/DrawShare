import { jsPDF } from "jspdf";
import { getStroke } from "perfect-freehand";
import { splitImageLayers } from "@/core/images";
import type { ImageItem, Page, Shape, Stroke, TextItem } from "@/core/types";

const PADDING = 32;
// A4 fallback for sheets with no stored size; real sheets use page.width/height.
const A4_W = 794;
const A4_H = 1123;

// Upscale exports for crisper PNG/PDF output, but back off on very large
// drawings so the OffscreenCanvas doesn't blow past browser size limits.
const MAX_EXPORT_SCALE = 4;
const MAX_EXPORT_DIMENSION = 8000;

export function exportScale(w: number, h: number): number {
  const longest = Math.max(w, h);
  return Math.min(MAX_EXPORT_SCALE, Math.max(1, Math.floor(MAX_EXPORT_DIMENSION / longest)));
}

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

// Compute world-space bounding box of all content, always expanding at least
// to the page guide rectangle (0,0)→(page.width,page.height) so a blank page
// still exports at its full dimensions.
function contentBounds(
  strokes: Stroke[],
  texts: TextItem[],
  shapes: Shape[],
  images: ImageItem[],
  page: Page,
): { minX: number; minY: number; maxX: number; maxY: number } {
  // A sized page seeds the bounds with its rectangle (so a blank page still
  // exports at full dimensions). A "no page size" page (0×0) seeds empty and
  // fits the content exactly.
  const sized = page.width > 0 && page.height > 0;
  let minX = sized ? 0 : Infinity;
  let minY = sized ? 0 : Infinity;
  let maxX = sized ? page.width : -Infinity;
  let maxY = sized ? page.height : -Infinity;

  for (const stroke of strokes) {
    // perfect-freehand caps expand roughly by size/2; add a small buffer.
    const half = stroke.size / 2 + 2;
    for (const p of stroke.points) {
      if (p.x - half < minX) minX = p.x - half;
      if (p.y - half < minY) minY = p.y - half;
      if (p.x + half > maxX) maxX = p.x + half;
      if (p.y + half > maxY) maxY = p.y + half;
    }
  }

  for (const shape of shapes) {
    const half = shape.size / 2 + 2;
    const sx = Math.min(shape.x1, shape.x2) - half;
    const sy = Math.min(shape.y1, shape.y2) - half;
    const ex = Math.max(shape.x1, shape.x2) + half;
    const ey = Math.max(shape.y1, shape.y2) + half;
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
    if (ex > maxX) maxX = ex;
    if (ey > maxY) maxY = ey;
  }

  for (const img of images) {
    if (img.x < minX) minX = img.x;
    if (img.y < minY) minY = img.y;
    if (img.x + img.width > maxX) maxX = img.x + img.width;
    if (img.y + img.height > maxY) maxY = img.y + img.height;
  }

  for (const item of texts) {
    const lines = item.text.split("\n");
    const lineHeight = item.size * 1.3;
    // Rough width estimate: average char ≈ 0.6× font size.
    const estW = Math.max(...lines.map((l) => l.length)) * item.size * 0.6;
    const estH = lines.length * lineHeight;
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + estW > maxX) maxX = item.x + estW;
    if (item.y + estH > maxY) maxY = item.y + estH;
  }

  // Empty no-size page (no content to bound) — fall back to a sane default.
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: page.width || 1240, maxY: page.height || 1754 };
  }
  return { minX, minY, maxX, maxY };
}

function drawStrokeToCtx(ctx: OffscreenCanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return;
  const inputs = stroke.points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
  const path = getStroke(inputs, { ...PEN_OPTIONS, size: stroke.size, last: true });
  if (path.length === 0) return;
  ctx.fillStyle = stroke.color;
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

function drawShapeToCtx(ctx: OffscreenCanvasRenderingContext2D, shape: Shape): void {
  ctx.save();
  ctx.strokeStyle = shape.color;
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

function drawTextToCtx(ctx: OffscreenCanvasRenderingContext2D, item: TextItem): void {
  if (!item.text) return;
  ctx.save();
  ctx.fillStyle = item.color;
  ctx.font = `${item.size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  const lineHeight = item.size * 1.3;
  const lines = item.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], item.x, item.y + i * lineHeight);
  }
  ctx.restore();
}

// Draw background pattern in world coords (called after ctx.translate, so
// world origin (0,0) still maps to the top-left of the page guide area).
function drawBackground(ctx: OffscreenCanvasRenderingContext2D, page: Page): void {
  const { width, height, background } = page;
  if (background === "blank") return;

  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
  ctx.lineWidth = 0.5;

  if (background === "ruled") {
    const spacing = 32;
    for (let y = spacing; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (background === "grid") {
    const spacing = 32;
    for (let x = 0; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (background === "dotted") {
    const spacing = 32;
    ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

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
    // Skip undecodable images silently
  }
}

// Render a page's content (fit to its bounds + padding) to a PNG blob and report
// the pixel size. Shared by the PNG and single-page PDF exports.
async function renderPageBlob(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[],
  images: ImageItem[],
): Promise<{ blob: Blob; w: number; h: number }> {
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const pageShapes = shapes.filter((s) => s.pageId === page.id);
  const pageImages = images.filter((i) => i.pageId === page.id);
  const texts = page.texts ?? [];

  // Size the export canvas to all content, not just the page guide rectangle.
  const { minX, minY, maxX, maxY } = contentBounds(
    pageStrokes,
    texts,
    pageShapes,
    pageImages,
    page,
  );
  const w = Math.ceil(maxX - minX + 2 * PADDING);
  const h = Math.ceil(maxY - minY + 2 * PADDING);
  const scale = exportScale(w, h);

  // World → canvas: world(minX, minY) → canvas(PADDING, PADDING).
  const canvas = new OffscreenCanvas(w * scale, h * scale);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w * scale, h * scale);
  ctx.scale(scale, scale);
  ctx.translate(-minX + PADDING, -minY + PADDING);
  drawBackground(ctx, page);
  // Images split into behind/front bands, matching canvas layer order.
  const { behind, front } = splitImageLayers(pageImages);
  for (const img of behind) await drawImageToCtx(ctx, img);
  for (const stroke of pageStrokes) drawStrokeToCtx(ctx, stroke);
  for (const shape of pageShapes) drawShapeToCtx(ctx, shape);
  for (const item of texts) drawTextToCtx(ctx, item);
  for (const img of front) await drawImageToCtx(ctx, img);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return { blob, w, h };
}

export async function exportPageAsPng(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[] = [],
  images: ImageItem[] = [],
): Promise<void> {
  const { blob } = await renderPageBlob(page, strokes, shapes, images);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (page.name || "page").replace(/[^a-z0-9_-]/gi, "_");
  a.download = `${safeName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export the current page's drawing as a single-page PDF (free canvas). The
// page is sized to the drawing's aspect ratio, longest side 297mm.
export async function exportPageAsPdf(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[] = [],
  images: ImageItem[] = [],
): Promise<void> {
  const { blob, w, h } = await renderPageBlob(page, strokes, shapes, images);
  const dataUrl = await blobToDataUrl(blob);
  const safeName = (page.name || "page").replace(/[^a-z0-9_-]/gi, "_");
  const long = 297;
  const wMm = w >= h ? long : Math.round(((long * w) / h) * 10) / 10;
  const hMm = w >= h ? Math.round(((long * h) / w) * 10) / 10 : long;

  const pdf = new jsPDF({
    orientation: wMm >= hMm ? "landscape" : "portrait",
    unit: "mm",
    format: [wMm, hMm],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, wMm, hMm);
  pdf.save(`${safeName}.pdf`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Render one notebook sheet to a high-res A4 PNG. Strokes/texts are stored
// page-local (0,0)..(A4_W,A4_H), so no world offset is needed — just clip to the
// sheet box and paint.
async function renderSheet(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[],
  images: ImageItem[],
): Promise<string> {
  // Sheets are the project's paper size; strokes are page-local in that space.
  const w = page.width || A4_W;
  const h = page.height || A4_H;
  const scale = exportScale(w, h);
  const canvas = new OffscreenCanvas(w * scale, h * scale);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w * scale, h * scale);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  drawBackground(ctx, { ...page, width: w, height: h });
  // Images split into behind/front bands, matching the canvas layer order.
  const { behind, front } = splitImageLayers(images.filter((i) => i.pageId === page.id));
  for (const img of behind) await drawImageToCtx(ctx, img);
  for (const s of strokes) if (s.pageId === page.id) drawStrokeToCtx(ctx, s);
  for (const sh of shapes) if (sh.pageId === page.id) drawShapeToCtx(ctx, sh);
  for (const t of page.texts ?? []) drawTextToCtx(ctx, t);
  for (const img of front) await drawImageToCtx(ctx, img);
  ctx.restore();
  return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
}

// Export the whole notebook as a multi-page PDF, one page per sheet, sized
// 210mm wide with height scaled to the sheet's aspect ratio (A4 lands back at
// 297mm; Letter/Legal/Square keep their own proportions).
export async function exportNotebookPdf(
  pages: Page[],
  strokes: Stroke[],
  shapes: Shape[] = [],
  images: ImageItem[] = [],
): Promise<void> {
  if (pages.length === 0) return;
  const sheetUrls = await Promise.all(pages.map((p) => renderSheet(p, strokes, shapes, images)));
  const w0 = pages[0].width || A4_W;
  const h0 = pages[0].height || A4_H;
  const pwMm = 210;
  const phMm = Math.round(((210 * h0) / w0) * 10) / 10;

  const pdf = new jsPDF({
    orientation: pwMm >= phMm ? "landscape" : "portrait",
    unit: "mm",
    format: [pwMm, phMm],
  });
  sheetUrls.forEach((src, i) => {
    if (i > 0) pdf.addPage([pwMm, phMm]);
    pdf.addImage(src, "PNG", 0, 0, pwMm, phMm);
  });
  pdf.save("notebook.pdf");
}
