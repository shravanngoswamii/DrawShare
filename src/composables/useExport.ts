import { getStroke } from "perfect-freehand";
import type { Page, Stroke, TextItem } from "@/core/types";

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

function drawStrokeToCtx(
  ctx: OffscreenCanvasRenderingContext2D,
  stroke: Stroke,
): void {
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
    const r = 1;
    ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

export async function exportPageAsPng(page: Page, strokes: Stroke[]): Promise<void> {
  const { width, height } = page;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Background pattern
  drawBackground(ctx, page);

  // Strokes (only those for this page)
  for (const stroke of strokes) {
    if (stroke.pageId === page.id) drawStrokeToCtx(ctx, stroke);
  }

  // Text items
  for (const item of page.texts ?? []) {
    drawTextToCtx(ctx, item);
  }

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
