import { getStroke } from "perfect-freehand";
import type { Page, Stroke, TextItem } from "@/core/types";

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
  page: Page,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = page.width;
  let maxY = page.height;

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

export async function exportPageAsPng(page: Page, strokes: Stroke[]): Promise<void> {
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const texts = page.texts ?? [];

  // Size the export canvas to all content, not just the page guide rectangle.
  const { minX, minY, maxX, maxY } = contentBounds(pageStrokes, texts, page);
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
  for (const stroke of pageStrokes) drawStrokeToCtx(ctx, stroke);
  for (const item of texts) drawTextToCtx(ctx, item);

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

// Export the A4 notebook area as a print-ready page (browser Save as PDF).
// Renders exactly the region (originX, originY) → (originX+A4_W, originY+A4_H)
// in world coordinates at 2× resolution, clips everything to the A4 boundary,
// opens a styled print window and triggers the browser print dialog.
export async function exportPageAsNotebookPdf(
  page: Page,
  strokes: Stroke[],
  originX: number,
  originY: number,
): Promise<void> {
  const scale = 2;
  const canvas = new OffscreenCanvas(A4_W * scale, A4_H * scale);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_W * scale, A4_H * scale);

  ctx.save();
  ctx.scale(scale, scale);
  // Clip to A4 bounds
  ctx.beginPath();
  ctx.rect(0, 0, A4_W, A4_H);
  ctx.clip();
  // Draw background pattern aligned to the A4 region
  drawBackground(ctx, { ...page, width: A4_W, height: A4_H });
  // Shift so world (originX, originY) maps to canvas (0, 0)
  ctx.translate(-originX, -originY);
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  for (const s of pageStrokes) drawStrokeToCtx(ctx, s);
  for (const t of page.texts ?? []) drawTextToCtx(ctx, t);
  ctx.restore();

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

  const safeName = (page.name || "page").replace(/[^a-z0-9_-]/gi, "_");
  const win = window.open("", "_blank");
  if (!win) {
    // Popup blocked: fall back to PNG download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${page.name}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4 portrait; margin: 0; }
html, body { width: 210mm; height: 297mm; overflow: hidden; background: #fff; }
img { width: 210mm; height: 297mm; display: block; }
@media screen {
  body { display: flex; align-items: center; justify-content: center; min-width: 100vw; min-height: 100vh; background: #e5e7eb; }
  img { box-shadow: 0 4px 24px rgba(0,0,0,.18); }
}
</style>
</head>
<body><img src="${dataUrl}" alt="${page.name}"></body>
</html>`);
  win.document.close();
  win.addEventListener("load", () => {
    setTimeout(() => win.print(), 250);
  });
}
