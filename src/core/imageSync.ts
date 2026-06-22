import { newId } from "@/core/ids";
import type { ImageItem } from "@/core/types";

// Live sessions relay images over a WebSocket with a ~1 MiB per-message cap and
// no chunking, so images are downscaled + re-encoded to fit comfortably in one
// frame before they're sent. The host keeps its full-resolution copy locally;
// only the streamed copy is shrunk.

const MAX_DIM = 1280;
// Char budget for the data URL — kept well under the relay's frame limit.
const MAX_LEN = 900_000;

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function encode(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  // webp keeps alpha and compresses well; falls back to png if unsupported.
  return canvas.toDataURL("image/webp", quality);
}

// Downscale/compress a data URL until it fits the relay frame budget.
export async function downscaleForSync(src: string): Promise<string> {
  if (src.length <= MAX_LEN && src.length < 200_000) return src; // already small
  const img = await loadHTMLImage(src);
  let dim = MAX_DIM;
  let quality = 0.82;
  let out = encode(img, dim, quality);
  for (let i = 0; i < 6 && out.length > MAX_LEN; i++) {
    if (quality > 0.5) quality -= 0.16;
    else dim = Math.round(dim * 0.8);
    out = encode(img, dim, quality);
  }
  return out;
}

// Read a picked image file and return a downscaled data URL ready to relay
// (used for chat image attachments). Returns null for non-images.
export async function fileToSyncSrc(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const rawSrc = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return downscaleForSync(rawSrc);
}

// Build an ImageItem (sync-ready, downscaled) from a picked file, centred at a
// world point and scaled so its longest side is ~`targetWorld` world units.
export async function imageItemFromFile(
  file: File,
  pageId: string,
  center: { x: number; y: number },
  targetWorld = 360,
): Promise<ImageItem | null> {
  if (!file.type.startsWith("image/")) return null;
  const rawSrc = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  const src = await downscaleForSync(rawSrc);
  const img = await loadHTMLImage(src);
  const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const scale = targetWorld / longest;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  return {
    id: newId(),
    pageId,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    src,
    createdAt: Date.now(),
  };
}
