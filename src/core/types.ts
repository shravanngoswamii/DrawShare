export type ID = string;

export type ShapeType = "rect" | "ellipse" | "line" | "arrow";

export type Tool = "select" | "pen" | "highlighter" | "eraser" | "text" | "fill" | ShapeType;

export type PenType = "ballpoint" | "brush" | "marker";

export interface StrokePoint {
  x: number;
  y: number;
  p: number;
  t: number;
}

// A named stack member of a page. Strokes, text, shapes and images each carry an
// optional layerId; content with no layerId (legacy or unassigned) always renders.
export interface Layer {
  id: ID;
  pageId: ID;
  name: string;
  visible: boolean;
  locked: boolean;
  index: number; // render order (lower = bottom)
  createdAt: number;
}

export interface Stroke {
  id: ID;
  pageId: ID;
  tool: Tool;
  penType?: PenType;
  color: string;
  size: number;
  opacity: number;
  points: StrokePoint[];
  createdAt: number;
  layerId?: ID;
}

export interface TextItem {
  id: ID;
  pageId: ID;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  createdAt: number;
  layerId?: ID;
}

export interface Page {
  id: ID;
  projectId: ID;
  index: number;
  name: string;
  width: number;
  height: number;
  background: "blank" | "ruled" | "grid" | "dotted";
  texts?: TextItem[];
  // Top-left corner of this page's A4 guide in world coords (notebook mode).
  // Optional for backward compatibility; absent means the origin (0, 0).
  originX?: number;
  originY?: number;
  createdAt: number;
  updatedAt: number;
}

export type NotebookMode = "off" | "notebook" | "strict";

// Direction the A4 sheets are tiled in notebook mode.
export type NotebookLayout = "vertical" | "horizontal";

export interface Project {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageOrder: ID[];
  // Canvas style for the whole project. Optional for backward compatibility;
  // absent means "off" (infinite canvas).
  notebookMode?: NotebookMode;
  // Tiling direction of the A4 stack in notebook mode; absent means "vertical".
  notebookLayout?: NotebookLayout;
  // Opt-in session recording for exact-history replay (default off / absent).
  recordReplay?: boolean;
  deletedAt?: number;
}

export interface Shape {
  id: ID;
  pageId: ID;
  type: ShapeType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
  opacity: number;
  createdAt: number;
  layerId?: ID;
}

export interface ImageItem {
  id: ID;
  pageId: ID;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // data URL
  // Stacking order vs the drawing. <= 0 (or absent) renders behind strokes/
  // shapes/text; > 0 renders in front. Within a band, sorted by z then createdAt.
  // "Send to back" pushes it more negative; "Bring to front" more positive.
  z?: number;
  // Legacy: images used to support a lock. Kept for back-compat with saved data
  // and sync messages; no longer set or honoured (always treated as unlocked).
  locked?: boolean;
  createdAt: number;
  layerId?: ID;
}

export type HistoryEntry =
  | { kind: "stroke-add"; stroke: Stroke }
  | { kind: "stroke-erase"; stroke: Stroke }
  | { kind: "text-upsert"; prev: TextItem | null; next: TextItem }
  | { kind: "text-delete"; text: TextItem }
  | {
      kind: "area-erase";
      pageId: string;
      before: Stroke[];
      after: Stroke[];
      // Shapes touched by the sweep are rasterized to ink, so the area-erase also
      // restores/reapplies the page's shapes on undo/redo.
      shapesBefore: Shape[];
      shapesAfter: Shape[];
    }
  | { kind: "shape-add"; shape: Shape }
  | { kind: "shape-erase"; shape: Shape }
  | { kind: "image-add"; image: ImageItem }
  | { kind: "image-erase"; image: ImageItem }
  | { kind: "layer-add"; layer: Layer }
  | {
      kind: "layer-delete";
      layer: Layer;
      // Content that lived on the deleted layer, captured so undo can restore both
      // the layer and the original layer assignment of every item it held.
      strokes: Stroke[];
      texts: TextItem[];
      shapes: Shape[];
      images: ImageItem[];
    };

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── Session recording (opt-in) ───────────────────────────────────────────────
// Forward-only content operations captured with timestamps when a project has
// recordReplay on. Replaying applies them in order, so erasures, moves and the
// effects of undo/redo all show up as they actually happened. "set" ops are
// upserts (add or replace by id); add ops carry the full item.
export type ReplayOp =
  | { op: "stroke-add"; stroke: Stroke }
  | { op: "stroke-remove"; pageId: ID; id: ID }
  | { op: "shape-add"; shape: Shape }
  | { op: "shape-remove"; pageId: ID; id: ID }
  | { op: "image-set"; image: ImageItem }
  | { op: "image-remove"; pageId: ID; id: ID }
  | { op: "text-set"; text: TextItem }
  | { op: "text-remove"; pageId: ID; id: ID }
  | { op: "page-clear"; pageId: ID };

export interface ReplayEvent {
  seq?: number; // autoincrement key, assigned by storage
  projectId: ID;
  t: number; // wall-clock ms when the op happened
  op: ReplayOp;
  // Snapshot of content that already existed when recording was switched on.
  // Replay shows these instantly at t=0 instead of re-animating them.
  baseline?: boolean;
}
