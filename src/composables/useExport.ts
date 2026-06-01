import { getStroke } from "perfect-freehand";
import type { Page, Stroke, TextItem } from "@/core/types";

const PADDING = 32;

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
