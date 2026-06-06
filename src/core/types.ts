export type ID = string;

export type ShapeType = "rect" | "ellipse" | "line" | "arrow";

export type Tool = "pen" | "highlighter" | "eraser" | "text" | ShapeType;

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
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageOrder: ID[];
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
  | { kind: "area-erase"; pageId: string; before: Stroke[]; after: Stroke[] }
  | { kind: "shape-add"; shape: Shape }
  | { kind: "shape-erase"; shape: Shape };

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
