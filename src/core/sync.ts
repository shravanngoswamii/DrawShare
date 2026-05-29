import type { Page, Project, Stroke, StrokePoint, TextItem } from "./types";

export type SyncMessage =
  | { t: "viewer-ready" }
  | {
      t: "hello";
      project: Project;
      pages: Page[];
      currentPageId: string;
      strokes: Stroke[];
      hostViewport: { width: number; height: number };
      hostCamera: { x: number; y: number; zoom: number };
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
    }
  | { t: "page-add"; page: Page; pages: Page[] }
  | { t: "page-delete"; pageId: string; pages: Page[]; fallbackPageId: string }
  | { t: "page-rename"; pageId: string; name: string }
  | { t: "page-background"; pageId: string; background: Page["background"] }
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
  | { t: "clear-page"; pageId: string };

export interface SessionHostHandlers {
  onViewerJoin(viewerId: string): void;
  onViewerLeave(viewerId: string): void;
  onError(err: Error): void;
}

export interface SessionViewerHandlers {
  onConnected(): void;
  onMessage(msg: SyncMessage): void;
  onDisconnect(): void;
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
