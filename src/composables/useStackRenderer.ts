import { PAGE_H, PAGE_W, sheetWorldPos } from "@/core/layout";
import type { Renderer } from "@/core/ports";
import type { NotebookLayout, Page, Stroke } from "@/core/types";

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
export function drawStack(
  renderer: Renderer,
  pages: Page[],
  strokes: Stroke[],
  layout: NotebookLayout,
  colors: SheetColors,
  range?: { first: number; last: number },
  editingTextId?: string,
): void {
  const byPage = new Map<string, Stroke[]>();
  for (const s of strokes) {
    const arr = byPage.get(s.pageId);
    if (arr) arr.push(s);
    else byPage.set(s.pageId, [s]);
  }
  const first = Math.max(0, range?.first ?? 0);
  const last = Math.min(pages.length - 1, range?.last ?? pages.length - 1);
  renderer.beginFrame();
  for (let i = first; i <= last; i++) {
    const page = pages[i];
    if (!page) continue;
    const { x, y } = sheetWorldPos(i, layout);
    renderer.setOrigin(x, y);
    renderer.drawSheetBackground(PAGE_W, PAGE_H, page.background, colors);
    const ps = byPage.get(page.id);
    if (ps) for (const s of ps) renderer.drawStroke(s);
    const texts = page.texts;
    if (texts) for (const t of texts) if (t.id !== editingTextId) renderer.drawText(t);
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
