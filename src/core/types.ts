export type ID = string;

export type ShapeType = "rect" | "ellipse" | "line" | "arrow";

export type Tool = "pen" | "highlighter" | "eraser" | "text" | ShapeType;

export type PenType = "ballpoint" | "brush" | "marker";

export interface StrokePoint {
  x: number;
  y: number;
  p: number;
  t: number;
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
  | { kind: "shape-erase"; shape: Shape };

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
