import type { ImageItem } from "./types";

// Split images into the two render bands relative to the drawing (strokes/shapes/
// text). `z <= 0` (or absent) sits behind the drawing; `z > 0` sits in front.
// Each band is sorted by z then creation time so stacking is stable and persisted.
export function splitImageLayers(images: ImageItem[]): { behind: ImageItem[]; front: ImageItem[] } {
  const byZ = (a: ImageItem, b: ImageItem) => (a.z ?? 0) - (b.z ?? 0) || a.createdAt - b.createdAt;
  const behind = images.filter((i) => (i.z ?? 0) <= 0).sort(byZ);
  const front = images.filter((i) => (i.z ?? 0) > 0).sort(byZ);
  return { behind, front };
}
