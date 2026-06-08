import { getStroke } from "perfect-freehand";
import { ref } from "vue";
import { storage } from "@/adapters/storage/indexedDB";
import type { Page, Project, Stroke } from "@/core/types";

// Page panel thumbnails: A4 ratio, contain mode
const THUMB_W = 52;
const THUMB_H = 74;

// Project card thumbnails: 4:3 card ratio, cover mode (fills the card area)
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

async function renderToCanvas(
  page: Page,
  strokes: Stroke[],
  w: number,
  h: number,
  cover: boolean,
): Promise<string | null> {
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const texts = page.texts ?? [];

  const scaleX = w / page.width;
  const scaleY = h / page.height;
  const scale = cover ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  // Cover mode: align to top-left so drawings near the page origin are always
  // visible. Contain mode: center within the thumbnail box.
  const centerX = (w - page.width * scale) / 2;
  const centerY = (h - page.height * scale) / 2;
  const offsetX = cover ? Math.max(0, centerX) : centerX;
  const offsetY = cover ? Math.max(0, centerY) : centerY;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

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
  const url = await renderToCanvas(page, strokes, THUMB_W, THUMB_H, false);
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
  const url = await renderToCanvas(firstPage, strokes, PROJ_W, PROJ_H, true);
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
