export type ID = string;

export type Tool = "pen" | "highlighter" | "eraser" | "text";

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
  // Top-left corner of this page's A4 guide in world coords (notebook mode).
  // Optional for backward compatibility; absent means the origin (0, 0).
  originX?: number;
  originY?: number;
  createdAt: number;
  updatedAt: number;
}

export type NotebookMode = "off" | "notebook" | "strict";

export interface Project {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageOrder: ID[];
  // Canvas style for the whole project. Optional for backward compatibility;
  // absent means "off" (infinite canvas).
  notebookMode?: NotebookMode;
}

export type HistoryEntry =
  | { kind: "stroke-add"; stroke: Stroke }
  | { kind: "stroke-erase"; stroke: Stroke }
  | { kind: "text-upsert"; prev: TextItem | null; next: TextItem }
  | { kind: "text-delete"; text: TextItem }
  | { kind: "area-erase"; pageId: string; before: Stroke[]; after: Stroke[] };

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
