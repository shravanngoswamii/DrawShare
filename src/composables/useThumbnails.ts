import { getStroke } from "perfect-freehand";
import { ref } from "vue";
import { storage } from "@/adapters/storage/indexedDB";
import type { Page, Project, Stroke, TextItem } from "@/core/types";

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

function contentBounds(pageStrokes: Stroke[], texts: TextItem[]): Bounds | null {
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

async function renderToCanvas(
  page: Page,
  strokes: Stroke[],
  w: number,
  h: number,
): Promise<string | null> {
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const texts = page.texts ?? [];

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const bounds = contentBounds(pageStrokes, texts);

  let scale: number;
  let offsetX: number;
  let offsetY: number;

  if (!bounds) {
    // No content — show top-left corner of the page at natural scale.
    scale = Math.min(w / page.width, h / page.height);
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

  ctx.restore();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return blobToDataUrl(blob);
}

async function renderThumbnail(page: Page, strokes: Stroke[]): Promise<void> {
  const url = await renderToCanvas(page, strokes, THUMB_W, THUMB_H);
  if (url) thumbnails.value[page.id] = url;
}

async function loadAndRenderThumbnail(page: Page): Promise<void> {
  const strokes = await storage.listStrokes(page.id);
  await renderThumbnail(page, strokes);
}

async function renderProjectThumbnail(project: Project): Promise<void> {
  const pages = await storage.listPages(project.id);
  if (!pages.length) return;
  const firstPage = pages[0];
  const strokes = await storage.listStrokes(firstPage.id);
  const url = await renderToCanvas(firstPage, strokes, PROJ_W, PROJ_H);
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
