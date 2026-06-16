import type {
  ID,
  Layer,
  NotebookLayout,
  NotebookMode,
  Page,
  Project,
  Shape,
  Stroke,
  StrokePoint,
  TextItem,
} from "./types";

export type SyncMessage =
  | { t: "viewer-ready" }
  | {
      t: "hello";
      project: Project;
      pages: Page[];
      currentPageId: string;
      strokes: Stroke[];
      shapes: Shape[];
      hostViewport: { width: number; height: number };
      hostCamera: { x: number; y: number; zoom: number };
      // Notebook mode (continuous A4 stack): all sheets' page-local strokes/shapes
      // plus the mode/layout, so a joiner can build the whole stack. The arrays are
      // streamed in chunked follow-up messages. Absent in Free mode.
      notebookMode?: NotebookMode;
      notebookLayout?: NotebookLayout;
      allStrokes?: Stroke[];
      allShapes?: Shape[];
    }
  | {
      t: "viewport";
      width: number;
      height: number;
      camX: number;
      camY: number;
      camZoom: number;
    }
  | {
      t: "page-set";
      pageId: string;
      pages: Page[];
      strokes: Stroke[];
      shapes: Shape[];
    }
  | { t: "page-add"; page: Page; pages: Page[] }
  | { t: "page-delete"; pageId: string; pages: Page[]; fallbackPageId: string }
  | { t: "page-rename"; pageId: string; name: string }
  | { t: "page-background"; pageId: string; background: Page["background"] }
  | { t: "page-size"; pageId: string; width: number; height: number }
  // Notebook stack: re-snapshot all sheets (mode/layout change mid-session) and
  // cheap layout-direction / reorder updates.
  | {
      t: "notebook-sync";
      notebookMode: NotebookMode;
      notebookLayout: NotebookLayout;
      pages: Page[];
      allStrokes: Stroke[];
      allShapes: Shape[];
    }
  // A batch of the notebook's strokes/shapes, appended to the viewer's stack. The
  // full snapshot is sent as several of these to stay under the data-channel size cap.
  | { t: "notebook-strokes"; strokes: Stroke[] }
  | { t: "notebook-shapes"; shapes: Shape[] }
  | { t: "notebook-layout"; layout: NotebookLayout }
  | { t: "stroke-begin"; stroke: Stroke }
  | {
      t: "stroke-points";
      pageId: string;
      strokeId: string;
      points: StrokePoint[];
      from: number;
    }
  | { t: "stroke-commit"; stroke: Stroke }
  | { t: "stroke-cancel"; pageId: string; strokeId: string }
  | { t: "stroke-delete"; pageId: string; strokeId: string }
  | { t: "text-commit"; text: TextItem }
  | { t: "text-delete"; pageId: string; textId: string }
  | { t: "clear-page"; pageId: string }
  | { t: "shape-commit"; shape: Shape }
  | { t: "shape-delete"; pageId: string; shapeId: string }
  | { t: "presenter"; mode: "laser" | "spotlight"; x: number; y: number }
  | { t: "presenter-off" }
  | { t: "layer-add"; layer: Layer }
  | { t: "layer-delete"; layerId: ID }
  | { t: "layer-update"; layer: Layer };

export interface SessionHostHandlers {
  onViewerJoin(viewerId: string): void;
  onViewerLeave(viewerId: string): void;
  onError(err: Error): void;
}

export interface SessionViewerHandlers {
  onConnected(): void;
  onMessage(msg: SyncMessage): void;
  onDisconnect(reason?: string): void;
  onError(err: Error): void;
}

export interface SessionAdapter {
  host(sessionId: string, handlers: SessionHostHandlers): Promise<string>;
  join(sessionId: string, offerToken: string, handlers: SessionViewerHandlers): Promise<string>;
  applyAnswer(answerToken: string): Promise<void>;
  send(msg: SyncMessage): void;
  close(): void;
  isOpen(): boolean;
}

export function makeSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}
