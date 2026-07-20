import { adaptInk } from "@/core/ink";
import type { Shape, Stroke } from "@/core/types";

export interface FloodFillResult {
  dataURL: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function cssColorToRgb(color: string): [number, number, number] {
  const c = new OffscreenCanvas(1, 1);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

// Scanline flood fill from (sx, sy) over same-colour pixels. Reports whether
// the fill ever reached the raster edge, so the caller can reject an "open"
// region instead of silently flooding past intended boundaries.
export function scanlineFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
): { filled: boolean; edgeTouched: boolean } {
  const targetIdx = (sy * width + sx) * 4;
  const targetR = data[targetIdx];
  const targetG = data[targetIdx + 1];
  const targetB = data[targetIdx + 2];

  if (targetR === 0 && targetG === 0 && targetB === 0) return { filled: false, edgeTouched: false };
  if (targetR === fillR && targetG === fillG && targetB === fillB) {
    return { filled: false, edgeTouched: false };
  }

  const match = (px: number, py: number) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return false;
    const i = (py * width + px) * 4;
    return data[i] === targetR && data[i + 1] === targetG && data[i + 2] === targetB;
  };

  const set = (px: number, py: number) => {
    const i = (py * width + px) * 4;
    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    data[i + 3] = fillA;
  };

  const stack: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
  const visited = new Uint8Array(width * height);
  let edgeTouched = false;

  while (stack.length > 0) {
    const { x: cx, y: cy } = stack.pop()!;
    if (visited[cy * width + cx]) continue;

    let left = cx;
    while (left > 0 && match(left - 1, cy)) left--;

    let right = cx;
    while (right < width - 1 && match(right + 1, cy)) right++;

    for (let px = left; px <= right; px++) {
      set(px, cy);
      visited[cy * width + px] = 1;
    }

    if (left === 0 || right === width - 1) edgeTouched = true;

    for (const dy of [-1, 1]) {
      const ny = cy + dy;
      if (ny < 0 || ny >= height) {
        edgeTouched = true;
        continue;
      }
      let inSpan = false;
      for (let px = left; px <= right; px++) {
        const hit = match(px, ny);
        if (hit && !visited[ny * width + px]) {
          if (!inSpan) {
            stack.push({ x: px, y: ny });
            inSpan = true;
          }
        } else {
          inSpan = false;
        }
      }
    }
  }

  return { filled: true, edgeTouched };
}

export function findFillBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  fillR: number,
  fillG: number,
  fillB: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] === fillR && data[i + 1] === fillG && data[i + 2] === fillB) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  return found ? { minX, minY, maxX, maxY } : null;
}

function renderStrokes(
  ctx: OffscreenCanvasRenderingContext2D,
  strokes: Stroke[],
  offX: number,
  offY: number,
  scale: number,
) {
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;
    ctx.beginPath();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(stroke.size * scale + 4, 4);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(pts[0].x * scale - offX * scale, pts[0].y * scale - offY * scale);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * scale - offX * scale, pts[i].y * scale - offY * scale);
    }
    ctx.stroke();
  }
}

function renderShapes(
  ctx: OffscreenCanvasRenderingContext2D,
  shapes: Shape[],
  offX: number,
  offY: number,
  scale: number,
) {
  for (const shape of shapes) {
    ctx.beginPath();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(shape.size * scale + 4, 4);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const x1 = shape.x1 * scale - offX * scale;
    const y1 = shape.y1 * scale - offY * scale;
    const x2 = shape.x2 * scale - offX * scale;
    const y2 = shape.y2 * scale - offY * scale;

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
      const headLen = Math.max(10, shape.size * scale * 5);
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
  }
}

// Fill the enclosed region at (worldX, worldY) with fillColor, bounded by the
// given strokes/shapes (already filtered to the target page/layer by the
// caller). Rasterizes them as black outlines on white, flood-fills from the
// click point, and returns just the filled pixels as a cropped PNG placed at
// its world position — the caller commits it as a regular image item.
export async function floodFill(
  worldX: number,
  worldY: number,
  fillColor: string,
  strokes: Stroke[],
  shapes: Shape[],
  pageOffsetX: number,
  pageOffsetY: number,
  isDark: boolean,
  opacity: number,
): Promise<FloodFillResult | null> {
  const SCALE = 2;
  const MAX_W = 3000;
  const MAX_H = 3000;
  const PADDING = 200;

  const lx = worldX - pageOffsetX;
  const ly = worldY - pageOffsetY;

  let minBX = Number.POSITIVE_INFINITY;
  let minBY = Number.POSITIVE_INFINITY;
  let maxBX = Number.NEGATIVE_INFINITY;
  let maxBY = Number.NEGATIVE_INFINITY;

  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minBX) minBX = p.x;
      if (p.x > maxBX) maxBX = p.x;
      if (p.y < minBY) minBY = p.y;
      if (p.y > maxBY) maxBY = p.y;
    }
  }
  for (const sh of shapes) {
    const x1 = Math.min(sh.x1, sh.x2);
    const x2 = Math.max(sh.x1, sh.x2);
    const y1 = Math.min(sh.y1, sh.y2);
    const y2 = Math.max(sh.y1, sh.y2);
    if (x1 < minBX) minBX = x1;
    if (x2 > maxBX) maxBX = x2;
    if (y1 < minBY) minBY = y1;
    if (y2 > maxBY) maxBY = y2;
  }

  if (!Number.isFinite(minBX)) {
    minBX = lx - PADDING;
    minBY = ly - PADDING;
    maxBX = lx + PADDING;
    maxBY = ly + PADDING;
  }

  minBX = Math.min(minBX, lx) - PADDING;
  minBY = Math.min(minBY, ly) - PADDING;
  maxBX = Math.max(maxBX, lx) + PADDING;
  maxBY = Math.max(maxBY, ly) + PADDING;

  const bw = Math.max(1, Math.ceil((maxBX - minBX) * SCALE));
  const bh = Math.max(1, Math.ceil((maxBY - minBY) * SCALE));

  if (bw > MAX_W || bh > MAX_H) return null;

  const canvas = new OffscreenCanvas(bw, bh);
  const ctx = canvas.getContext("2d")!;
  const cw = canvas.width;
  const ch = canvas.height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);

  renderStrokes(ctx, strokes, minBX, minBY, SCALE);
  renderShapes(ctx, shapes, minBX, minBY, SCALE);

  const imageData = ctx.getImageData(0, 0, cw, ch);
  const data = imageData.data;

  const px = Math.round((lx - minBX) * SCALE);
  const py = Math.round((ly - minBY) * SCALE);
  if (px < 0 || px >= cw || py < 0 || py >= ch) return null;

  const adapted = adaptInk(fillColor, isDark);
  const [fr, fg, fb] = cssColorToRgb(adapted);
  const fa = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  const fillResult = scanlineFill(data, cw, ch, px, py, fr, fg, fb, fa);
  if (!fillResult.filled || fillResult.edgeTouched) return null;

  const bounds = findFillBounds(data, cw, ch, fr, fg, fb);
  if (!bounds) return null;

  const cropW = bounds.maxX - bounds.minX + 1;
  const cropH = bounds.maxY - bounds.minY + 1;

  const cropCanvas = new OffscreenCanvas(cropW, cropH);
  const cropCtx = cropCanvas.getContext("2d")!;
  const cropData = cropCtx.createImageData(cropW, cropH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((bounds.minY + y) * cw + (bounds.minX + x)) * 4;
      const dstIdx = (y * cropW + x) * 4;
      const isFill = data[srcIdx] === fr && data[srcIdx + 1] === fg && data[srcIdx + 2] === fb;
      if (isFill) {
        cropData.data[dstIdx] = data[srcIdx];
        cropData.data[dstIdx + 1] = data[srcIdx + 1];
        cropData.data[dstIdx + 2] = data[srcIdx + 2];
        cropData.data[dstIdx + 3] = data[srcIdx + 3];
      } else {
        cropData.data[dstIdx + 3] = 0;
      }
    }
  }
  cropCtx.putImageData(cropData, 0, 0);

  const blob = await cropCanvas.convertToBlob({ type: "image/png" });
  const dataURL = await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });

  return {
    dataURL,
    x: minBX + bounds.minX / SCALE,
    y: minBY + bounds.minY / SCALE,
    width: cropW / SCALE,
    height: cropH / SCALE,
  };
}
