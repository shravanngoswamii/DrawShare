import type { ID, Page, Project, Stroke, TextItem } from "./types";

export interface StorageAdapter {
  init(): Promise<void>;
  listProjects(): Promise<Project[]>;
  getProject(id: ID): Promise<Project | undefined>;
  putProject(p: Project): Promise<void>;
  deleteProject(id: ID): Promise<void>;

  listPages(projectId: ID): Promise<Page[]>;
  getPage(id: ID): Promise<Page | undefined>;
  putPage(p: Page): Promise<void>;
  deletePage(id: ID): Promise<void>;

  listStrokes(pageId: ID): Promise<Stroke[]>;
  putStroke(s: Stroke): Promise<void>;
  deleteStroke(id: ID): Promise<void>;
  deleteStrokesForPage(pageId: ID): Promise<void>;
}

export interface InputAdapter {
  start(target: HTMLElement, handlers: InputHandlers): void;
  stop(): void;
}

export interface InputHandlers {
  onDown(s: InputSample): void;
  onMove(samples: InputSample[]): void;
  onUp(s?: InputSample): void;
  onCancel(s?: InputSample): void;
  onPredict?(samples: InputSample[]): void;
}

export interface InputSample {
  x: number;
  y: number;
  pressure: number;
  t: number;
  pointerType: "pen" | "touch" | "mouse";
}

export interface Renderer {
  attach(canvas: HTMLCanvasElement): void;
  setViewport(width: number, height: number, dpr: number): void;
  setCamera(cam: Camera): void;
  clear(): void;
  drawStroke(s: Stroke): void;
  drawLive(s: Stroke): void;
  drawText(item: TextItem): void;
  beginFrame(): void;
  endFrame(): void;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
