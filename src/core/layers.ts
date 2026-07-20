import { splitImageLayers } from "./images";
import type { ImageItem, Layer, Shape, Stroke, TextItem } from "./types";

export type Renderable =
  | { kind: "image"; item: ImageItem }
  | { kind: "stroke"; item: Stroke }
  | { kind: "shape"; item: Shape }
  | { kind: "text"; item: TextItem };

// Flatten a page's content into draw order that honors layer z-order: layers
// paint bottom (lowest index) to top. Within a layer the order is behind-images,
// strokes, shapes, texts, front-images — the same sequence a single layer has
// always used, so one-layer documents render exactly as before. Content whose
// layerId is missing or points at an unknown layer drops into the bottom layer.
export function orderByLayer(
  layers: Layer[],
  strokes: Stroke[],
  shapes: Shape[],
  images: ImageItem[],
  texts: TextItem[],
): Renderable[] {
  const sorted = [...layers].sort((a, b) => a.index - b.index);
  const rankOf = new Map<string, number>();
  sorted.forEach((l, i) => {
    rankOf.set(l.id, i);
  });
  const rank = (layerId?: string) => (layerId != null ? (rankOf.get(layerId) ?? 0) : 0);

  const buckets = Array.from({ length: Math.max(1, sorted.length) }, () => ({
    strokes: [] as Stroke[],
    shapes: [] as Shape[],
    images: [] as ImageItem[],
    texts: [] as TextItem[],
  }));
  for (const s of strokes) buckets[rank(s.layerId)].strokes.push(s);
  for (const sh of shapes) buckets[rank(sh.layerId)].shapes.push(sh);
  for (const im of images) buckets[rank(im.layerId)].images.push(im);
  for (const t of texts) buckets[rank(t.layerId)].texts.push(t);

  const out: Renderable[] = [];
  for (const b of buckets) {
    const { behind, front } = splitImageLayers(b.images);
    for (const im of behind) out.push({ kind: "image", item: im });
    for (const s of sortHighlightersBehind(b.strokes)) out.push({ kind: "stroke", item: s });
    for (const sh of b.shapes) out.push({ kind: "shape", item: sh });
    for (const t of b.texts) out.push({ kind: "text", item: t });
    for (const im of front) out.push({ kind: "image", item: im });
  }
  return out;
}

// Highlighter ink is meant to sit under pen/pencil strokes rather than occlude
// them, so within a layer it always draws first regardless of creation order.
export function sortHighlightersBehind(strokes: Stroke[]): Stroke[] {
  return [...strokes].sort((a, b) => {
    if (a.tool === "highlighter" && b.tool !== "highlighter") return -1;
    if (a.tool !== "highlighter" && b.tool === "highlighter") return 1;
    return 0;
  });
}
