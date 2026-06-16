import { PAGE_H, PAGE_W, sheetWorldPos } from "@/core/layout";
import type { Renderer } from "@/core/ports";
import type { ImageItem, NotebookLayout, Page, Shape, Stroke } from "@/core/types";

export interface SheetColors {
  paper: string;
  line: string;
  dot: string;
}

// Render a continuous A4 notebook stack. Strokes/texts are stored in page-local
// coords; each sheet is shifted to its world position via renderer.setOrigin, so
// the same data renders identically in the editor and the live viewer.
//
// `range` lets the caller cull off-screen sheets; `editingTextId` skips a text
// currently being edited in a DOM overlay so it isn't double-drawn.
export interface DrawStackOptions {
  range?: { first: number; last: number };
  editingTextId?: string;
  // Strict mode clips ink to each sheet; non-strict ("notebook") leaves the sheet
  // a guide and shows ink drawn outside it. Defaults to clipped.
  clip?: boolean;
}

export function drawStack(
  renderer: Renderer,
  pages: Page[],
  strokes: Stroke[],
  shapes: Shape[],
  images: ImageItem[],
  layout: NotebookLayout,
  colors: SheetColors,
  opts: DrawStackOptions = {},
): void {
  const { range, editingTextId, clip = true } = opts;
  const byPage = new Map<string, Stroke[]>();
  for (const s of strokes) {
    const arr = byPage.get(s.pageId);
    if (arr) arr.push(s);
    else byPage.set(s.pageId, [s]);
  }
  const shapesByPage = new Map<string, Shape[]>();
  for (const sh of shapes) {
    const arr = shapesByPage.get(sh.pageId);
    if (arr) arr.push(sh);
    else shapesByPage.set(sh.pageId, [sh]);
  }
  const imagesByPage = new Map<string, ImageItem[]>();
  for (const img of images) {
    const arr = imagesByPage.get(img.pageId);
    if (arr) arr.push(img);
    else imagesByPage.set(img.pageId, [img]);
  }
  const first = Math.max(0, range?.first ?? 0);
  const last = Math.min(pages.length - 1, range?.last ?? pages.length - 1);
  renderer.beginFrame();
  // Pass 1: paint every sheet's paper + pattern first so a later sheet never
  // covers ink that overflowed onto it from an earlier one.
  for (let i = first; i <= last; i++) {
    const page = pages[i];
    if (!page) continue;
    const { x, y } = sheetWorldPos(i, layout);
    renderer.setOrigin(x, y);
    renderer.pushClip(PAGE_W, PAGE_H);
    renderer.drawSheetBackground(PAGE_W, PAGE_H, page.background, colors);
    renderer.popClip();
  }
  // Pass 2: ink. Clipped to the sheet in strict mode; free (visible outside the
  // sheet) in notebook mode.
  for (let i = first; i <= last; i++) {
    const page = pages[i];
    if (!page) continue;
    const { x, y } = sheetWorldPos(i, layout);
    renderer.setOrigin(x, y);
    if (clip) renderer.pushClip(PAGE_W, PAGE_H);
    // Images sit below strokes/shapes/text.
    const imgs = imagesByPage.get(page.id);
    if (imgs) for (const img of imgs) renderer.drawImageItem(img);
    const ps = byPage.get(page.id);
    if (ps) for (const s of ps) renderer.drawStroke(s);
    const shs = shapesByPage.get(page.id);
    if (shs) for (const sh of shs) renderer.drawShape(sh);
    const texts = page.texts;
    if (texts) for (const t of texts) if (t.id !== editingTextId) renderer.drawText(t);
    if (clip) renderer.popClip();
  }
  renderer.endFrame();
}

// Resolve the sheet paper/line/dot colors from the live CSS theme variables.
// Called by stages on mount and theme change so canvas-drawn sheets match the
// app's tokens in both light and dark mode.
export function resolveSheetColors(el: HTMLElement): SheetColors {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    paper: v("--color-canvas-surface", "#ffffff"),
    line: v("--color-canvas-line", "rgba(148,163,184,0.4)"),
    dot: v("--color-canvas-dot", "rgba(148,163,184,0.6)"),
  };
}
