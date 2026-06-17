import type { NotebookLayout } from "./types";

// Canonical A4 sheet geometry for the continuous notebook, in world units
// (210×297mm at 96 DPI). The stored page.width/height (legacy 150 DPI) is NOT
// used for sheet layout — this module is the single source of sheet geometry.
export const PAGE_W = 794;
export const PAGE_H = 1123;
// Gap between consecutive sheets in the scroll stack.
export const PAGE_GAP = 48;

// Top-left world position of the sheet at `index` for the given layout.
export function sheetWorldPos(index: number, layout: NotebookLayout): { x: number; y: number } {
  if (layout === "horizontal") return { x: index * (PAGE_W + PAGE_GAP), y: 0 };
  return { x: 0, y: index * (PAGE_H + PAGE_GAP) };
}

// World bounds covering the whole stack (used for fit/centering extents).
export function stackBounds(
  count: number,
  layout: NotebookLayout,
): { width: number; height: number } {
  if (count <= 0) return { width: PAGE_W, height: PAGE_H };
  if (layout === "horizontal") {
    return { width: count * PAGE_W + (count - 1) * PAGE_GAP, height: PAGE_H };
  }
  return { width: PAGE_W, height: count * PAGE_H + (count - 1) * PAGE_GAP };
}

// The sheet a world point falls in, with its page-local coords. Returns null if
// the point is in a gap between sheets, in a side margin, or out of range — so
// callers can refuse to start a stroke there.
export function worldToSheet(
  wx: number,
  wy: number,
  count: number,
  layout: NotebookLayout,
): { index: number; localX: number; localY: number } | null {
  if (count <= 0) return null;
  if (layout === "horizontal") {
    if (wy < 0 || wy > PAGE_H || wx < 0) return null;
    const stride = PAGE_W + PAGE_GAP;
    const index = Math.floor(wx / stride);
    if (index < 0 || index >= count) return null;
    const localX = wx - index * stride;
    if (localX > PAGE_W) return null;
    return { index, localX, localY: wy };
  }
  if (wx < 0 || wx > PAGE_W || wy < 0) return null;
  const stride = PAGE_H + PAGE_GAP;
  const index = Math.floor(wy / stride);
  if (index < 0 || index >= count) return null;
  const localY = wy - index * stride;
  if (localY > PAGE_H) return null;
  return { index, localX: wx, localY };
}

// Nearest sheet index to a world coordinate along the stacking axis — used to
// pick the "active sheet" (the one centered in the viewport).
export function nearestSheetIndex(
  wx: number,
  wy: number,
  count: number,
  layout: NotebookLayout,
): number {
  if (count <= 0) return 0;
  const stride = layout === "horizontal" ? PAGE_W + PAGE_GAP : PAGE_H + PAGE_GAP;
  const half = (layout === "horizontal" ? PAGE_W : PAGE_H) / 2;
  const coord = layout === "horizontal" ? wx : wy;
  const idx = Math.round((coord - half) / stride);
  return Math.max(0, Math.min(count - 1, idx));
}

// First/last sheet index whose world rect intersects the visible world range
// [viewMin, viewMax] along the stacking axis — used to cull off-screen sheets.
export function visibleSheetRange(
  count: number,
  layout: NotebookLayout,
  viewMin: number,
  viewMax: number,
): { first: number; last: number } {
  if (count <= 0) return { first: 0, last: -1 };
  const stride = layout === "horizontal" ? PAGE_W + PAGE_GAP : PAGE_H + PAGE_GAP;
  const first = Math.max(0, Math.floor(viewMin / stride));
  const last = Math.min(count - 1, Math.floor(viewMax / stride));
  return { first, last };
}
