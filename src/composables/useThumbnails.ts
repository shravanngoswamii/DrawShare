import { getStroke } from "perfect-freehand";
import { ref } from "vue";
import { storage } from "@/adapters/storage/indexedDB";
import type { Page, Stroke } from "@/core/types";

const THUMB_W = 48;
const THUMB_H = 68;

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

const thumbnails = ref<Record<string, string>>({});

async function renderThumbnail(page: Page, strokes: Stroke[]): Promise<void> {
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const texts = page.texts ?? [];

  const scale = Math.min(THUMB_W / page.width, THUMB_H / page.height);

  const canvas = new OffscreenCanvas(THUMB_W, THUMB_H);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  ctx.scale(scale, scale);

  for (const stroke of pageStrokes) {
    if (stroke.points.length === 0) continue;
    const inputs = stroke.points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
    const path = getStroke(inputs, { ...PEN_OPTIONS, size: stroke.size, last: true });
    if (!path.length) continue;
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

  for (const item of texts) {
    if (!item.text) continue;
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

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const dataUrl = await blobToDataUrl(blob);
  thumbnails.value[page.id] = dataUrl;
}

async function loadAndRenderThumbnail(page: Page): Promise<void> {
  const strokes = await storage.listStrokes(page.id);
  await renderThumbnail(page, strokes);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export function useThumbnails() {
  return { thumbnails, renderThumbnail, loadAndRenderThumbnail };
}
