import { getStroke } from "perfect-freehand";
import { splitImageLayers } from "@/core/images";
import type { ImageItem, Page, Shape, Stroke, TextItem } from "@/core/types";

const PADDING = 32;
// A4 at 96 DPI — matches CanvasStage PAGE_W / PAGE_H constants.
const A4_W = 794;
const A4_H = 1123;

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

export async function exportPageAsPng(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[] = [],
  images: ImageItem[] = [],
): Promise<void> {
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
  const canvasW = Math.ceil(maxX - minX + 2 * PADDING);
  const canvasH = Math.ceil(maxY - minY + 2 * PADDING);

  // World → canvas: world(minX, minY) → canvas(PADDING, PADDING).
  const offsetX = -minX + PADDING;
  const offsetY = -minY + PADDING;

  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.translate(offsetX, offsetY);
  drawBackground(ctx, page);
  // Images split into behind/front bands, matching canvas layer order.
  const { behind, front } = splitImageLayers(pageImages);
  for (const img of behind) await drawImageToCtx(ctx, img);
  for (const stroke of pageStrokes) drawStrokeToCtx(ctx, stroke);
  for (const shape of pageShapes) drawShapeToCtx(ctx, shape);
  for (const item of texts) drawTextToCtx(ctx, item);
  for (const img of front) await drawImageToCtx(ctx, img);

  const blob = await canvas.convertToBlob({ type: "image/png" });
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Render one notebook sheet to a 2×-resolution A4 PNG. Strokes/texts are stored
// page-local (0,0)..(A4_W,A4_H), so no world offset is needed — just clip to the
// sheet box and paint.
async function renderSheet(
  page: Page,
  strokes: Stroke[],
  shapes: Shape[],
  images: ImageItem[],
): Promise<string> {
  const scale = 2;
  const canvas = new OffscreenCanvas(A4_W * scale, A4_H * scale);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_W * scale, A4_H * scale);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, A4_W, A4_H);
  ctx.clip();
  drawBackground(ctx, { ...page, width: A4_W, height: A4_H });
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

function downloadDataUrl(dataUrl: string, name: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Export the whole notebook as a print-ready multi-page PDF (one A4 page per
// sheet) via the browser's "Save as PDF". No PDF dependency — each sheet is an
// A4 image laid out one-per-printed-page with CSS page breaks.
export async function exportNotebookPdf(
  pages: Page[],
  strokes: Stroke[],
  shapes: Shape[] = [],
  images: ImageItem[] = [],
): Promise<void> {
  if (pages.length === 0) return;
  const sheetUrls = await Promise.all(pages.map((p) => renderSheet(p, strokes, shapes, images)));

  const win = window.open("", "_blank");
  if (!win) {
    // Popup blocked: download each sheet as a PNG instead.
    sheetUrls.forEach((src, i) => {
      downloadDataUrl(src, `page-${i + 1}.png`);
    });
    return;
  }

  const sheets = sheetUrls
    .map((src) => `<div class="sheet"><img src="${src}" alt=""></div>`)
    .join("");
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Notebook</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4 portrait; margin: 0; }
html, body { background: #fff; }
.sheet { width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
img { width: 210mm; height: 297mm; display: block; }
@media screen {
  body { background: #e5e7eb; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px; }
  .sheet { box-shadow: 0 4px 24px rgba(0,0,0,.18); }
}
</style>
</head>
<body>${sheets}</body>
</html>`);
  win.document.close();
  win.addEventListener("load", () => {
    setTimeout(() => win.print(), 300);
  });
}
