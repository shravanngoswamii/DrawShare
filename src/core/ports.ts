import type { ID, ImageItem, Page, Project, ReplayEvent, Shape, Stroke, TextItem } from "./types";

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

  listShapes(pageId: ID): Promise<Shape[]>;
  putShape(s: Shape): Promise<void>;
  deleteShape(id: ID): Promise<void>;
  deleteShapesForPage(pageId: ID): Promise<void>;

  listImages(pageId: ID): Promise<ImageItem[]>;
  putImage(img: ImageItem): Promise<void>;
  deleteImage(id: ID): Promise<void>;
  deleteImagesForPage(pageId: ID): Promise<void>;

  // Session-recording event log (opt-in replay).
  appendEvent(e: ReplayEvent): Promise<void>;
  listEvents(projectId: ID): Promise<ReplayEvent[]>;
  clearEvents(projectId: ID): Promise<void>;
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
  drawShape(s: Shape): void;
  // Images: decode/cache a bitmap (async), draw a cached one at its rect, and
  // free it. Drawn below strokes/shapes/text. Cache keyed by image id.
  loadImage(item: ImageItem): Promise<void>;
  drawImageItem(item: ImageItem): void;
  releaseImage(id: ID): void;
  beginFrame(): void;
  endFrame(): void;
  // Shift the world origin by (dx, dy) so subsequent draws land at that offset.
  // Used to place each A4 sheet of a notebook stack at its world position while
  // its strokes/texts stay in page-local coordinates.
  setOrigin(dx: number, dy: number): void;
  // Clip subsequent draws to the local rect (0,0)..(width,height) until
  // popClip() — keeps notebook ink inside its sheet. Save/restore based.
  pushClip(width: number, height: number): void;
  popClip(): void;
  // Paint a sheet's paper + background pattern at the current origin, in local
  // coords (0,0)..(width,height).
  drawSheetBackground(
    width: number,
    height: number,
    background: Page["background"],
    colors: { paper: string; line: string; dot: string },
  ): void;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
