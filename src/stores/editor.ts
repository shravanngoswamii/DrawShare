import { defineStore } from "pinia";
import { storage } from "@/adapters/storage/indexedDB";
import { newId } from "@/core/ids";
import { shapeSegments } from "@/core/shapes";
import type {
  HistoryEntry,
  ImageItem,
  Layer,
  NotebookLayout,
  NotebookMode,
  Page,
  PenType,
  Project,
  ReplayOp,
  Shape,
  Stroke,
  StrokePoint,
  TextItem,
  Tool,
} from "@/core/types";
import { dlog } from "@/debug";
import { useLiveStore } from "./live";
import { DEFAULT_PAGE_SIZE, useProjectsStore } from "./projects";

// Sub-interval [t1, t2] of segment A→B that lies inside the eraser — a circle of
// the given radius, or (square) a box of half-size radius — centred at (wx, wy);
// null if the segment misses it. Used to clip both strokes and shape outlines.
function eraserHitInterval(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  wx: number,
  wy: number,
  radius: number,
  square: boolean,
): [number, number] | null {
  const dx = bx - ax;
  const dy = by - ay;
  if (square) {
    const slab = (p0: number, d: number, lo: number, hi: number): [number, number] | null => {
      if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi ? [0, 1] : null;
      let t0 = (lo - p0) / d;
      let t1 = (hi - p0) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      return [t0, t1];
    };
    const xi = slab(ax, dx, wx - radius, wx + radius);
    if (!xi) return null;
    const yi = slab(ay, dy, wy - radius, wy + radius);
    if (!yi) return null;
    const t1 = Math.max(0, xi[0], yi[0]);
    const t2 = Math.min(1, xi[1], yi[1]);
    return t1 <= t2 ? [t1, t2] : null;
  }
  const r2 = radius * radius;
  const fx = ax - wx;
  const fy = ay - wy;
  const aa = dx * dx + dy * dy;
  if (aa < 1e-9) return fx * fx + fy * fy <= r2 ? [0, 1] : null;
  const bb = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - r2;
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = Math.max(0, (-bb - sq) / (2 * aa));
  const t2 = Math.min(1, (-bb + sq) / (2 * aa));
  return t1 <= t2 ? [t1, t2] : null;
}

interface EditorState {
  project: Project | undefined;
  pages: Page[];
  currentPageId: string | undefined;
  strokes: Stroke[];
  shapes: Shape[];
  images: ImageItem[];
  // Layers of the current page (sorted by index, bottom-first) and the one new
  // content is drawn onto.
  layers: Layer[];
  currentLayerId: string | null;
  tool: Tool;
  penType: PenType;
  color: string;
  toolSizes: Record<Tool, number>;
  opacity: number;
  eraserMode: "stroke" | "area";
  eraserShape: "circle" | "square";
  saving: number;
  history: HistoryEntry[];
  redoStack: HistoryEntry[];
  _areaEraseBefore: Stroke[] | null;
  _areaEraseShapesBefore: Shape[] | null;
  camera: { x: number; y: number; zoom: number };
  isDrawing: boolean;
  presenterMode: "off" | "laser" | "spotlight";
  // Bumped to ask the canvas to scroll/animate to a sheet (notebook overview clicks).
  scrollRequestPageId: string | undefined;
  scrollRequestNonce: number;
}

export const useEditorStore = defineStore("editor", {
  state: (): EditorState => ({
    project: undefined,
    pages: [],
    currentPageId: undefined,
    strokes: [],
    shapes: [],
    images: [],
    layers: [],
    currentLayerId: null,
    tool: "pen",
    penType: "ballpoint",
    color: "#0f172a",
    toolSizes: {
      pen: 4,
      highlighter: 20,
      eraser: 24,
      text: 4,
      rect: 2,
      ellipse: 2,
      line: 2,
      arrow: 2,
    },
    opacity: 1,
    eraserMode: "area",
    eraserShape: "circle",
    saving: 0,
    history: [],
    redoStack: [],
    _areaEraseBefore: null,
    _areaEraseShapesBefore: null,
    camera: { x: 0, y: 0, zoom: 1 },
    isDrawing: false,
    presenterMode: "off",
    scrollRequestPageId: undefined,
    scrollRequestNonce: 0,
  }),
  getters: {
    currentPage(state): Page | undefined {
      return state.pages.find((p) => p.id === state.currentPageId);
    },
    size(state): number {
      return state.toolSizes[state.tool];
    },
    // The layer new content lands on; falls back to the bottom layer.
    currentLayer(state): Layer | undefined {
      return state.layers.find((l) => l.id === state.currentLayerId) ?? state.layers[0];
    },
    // Canvas style is a project-wide setting (persisted on the project).
    notebookMode(state): NotebookMode {
      return state.project?.notebookMode ?? "off";
    },
    // Tiling direction of the A4 stack (project-wide); "vertical" when unset.
    notebookLayout(state): NotebookLayout {
      return state.project?.notebookLayout ?? "vertical";
    },
    // Opt-in session recording for exact-history replay (project-wide).
    recordReplay(state): boolean {
      return state.project?.recordReplay ?? false;
    },
  },
  actions: {
    async open(projectId: string) {
      // Skip the DB round-trip if this project is already loaded (e.g. just created).
      if (this.project?.id === projectId && this.pages.length > 0) return;
      const project = await storage.getProject(projectId);
      if (!project) throw new Error("Project not found");
      this.project = project;
      // Point the projects-list store at this same object. Otherwise it keeps a
      // separate copy loaded at startup, and its background touch()/rename writes
      // would clobber editor-side fields like notebookMode on the next save.
      const projects = useProjectsStore();
      const idx = projects.projects.findIndex((p) => p.id === projectId);
      if (idx >= 0) projects.projects[idx] = project;
      this.pages = await storage.listPages(projectId);
      if (this.pages.length === 0) {
        const page = await this.createPageInternal(0);
        this.pages = [page];
      }
      this.currentPageId = this.pages[0].id;
      // Notebook mode renders the whole stack at once, so load every sheet's
      // strokes/shapes/images; Free mode keeps only the current page in memory.
      if (this.notebookMode !== "off") {
        await this.loadAllStrokes();
        await this.loadAllShapes();
        await this.loadAllImages();
      } else {
        await this.loadStrokes(this.currentPageId);
        await this.loadShapes(this.currentPageId);
        await this.loadImages(this.currentPageId);
      }
      await this.loadLayers(this.currentPageId);
      this.history = [];
      this.redoStack = [];
    },
    initNew(project: import("@/core/types").Project, page: import("@/core/types").Page) {
      this.project = project;
      this.pages = [page];
      this.currentPageId = page.id;
      this.strokes = [];
      this.shapes = [];
      this.images = [];
      this.layers = [];
      this.currentLayerId = null;
      this.history = [];
      this.redoStack = [];
      // Async: creates the default "Layer 1" if the page has none.
      void this.loadLayers(page.id);
    },
    async loadStrokes(pageId: string) {
      this.strokes = await storage.listStrokes(pageId);
    },
    // Load a page's layers, creating a default "Layer 1" if none exist, and select
    // the first drawable (visible + unlocked) layer.
    async loadLayers(pageId: string) {
      let layers = await storage.listLayers(pageId);
      if (layers.length === 0) {
        const defaultLayer: Layer = {
          id: newId(),
          pageId,
          name: "Layer 1",
          visible: true,
          locked: false,
          index: 0,
          createdAt: Date.now(),
        };
        await storage.putLayer(defaultLayer);
        layers = [defaultLayer];
      }
      this.layers = layers;
      const preferred = layers.find((l) => l.visible && !l.locked) ?? layers[0];
      this.currentLayerId = preferred?.id ?? null;
    },
    async loadShapes(pageId: string) {
      this.shapes = await storage.listShapes(pageId);
    },
    async loadImages(pageId: string) {
      this.images = await storage.listImages(pageId);
    },
    // Notebook mode: load every sheet's strokes/shapes/images into one array (each
    // tagged by pageId). The renderer offsets each sheet to its world position.
    async loadAllStrokes() {
      const lists = await Promise.all(this.pages.map((p) => storage.listStrokes(p.id)));
      this.strokes = lists.flat();
    },
    async loadAllShapes() {
      const lists = await Promise.all(this.pages.map((p) => storage.listShapes(p.id)));
      this.shapes = lists.flat();
    },
    async loadAllImages() {
      const lists = await Promise.all(this.pages.map((p) => storage.listImages(p.id)));
      this.images = lists.flat();
    },
    // Free mode only: switch the visible page (reloads its strokes, resets
    // history, tells viewers to follow). Notebook mode uses setActiveSheet.
    async selectPage(pageId: string) {
      if (this.currentPageId === pageId) return;
      this.currentPageId = pageId;
      await this.loadStrokes(pageId);
      await this.loadShapes(pageId);
      await this.loadImages(pageId);
      await this.loadLayers(pageId);
      this.history = [];
      this.redoStack = [];
      useLiveStore().broadcast({
        t: "page-set",
        pageId,
        pages: [...this.pages],
        strokes: [...this.strokes],
        shapes: [...this.shapes],
      });
    },
    // Notebook mode: mark which sheet is "active" (panel highlight, export-current,
    // add-after) without reloading strokes, clearing history, or broadcasting —
    // every sheet is already loaded and there is no page switch in a continuous stack.
    setActiveSheet(pageId: string) {
      if (this.currentPageId === pageId) return;
      this.currentPageId = pageId;
      // Track the active sheet's layers so the Layers panel reflects it.
      void this.loadLayers(pageId);
    },
    // Ask the canvas to scroll/animate to a sheet (notebook overview clicks).
    requestScrollToSheet(pageId: string) {
      this.currentPageId = pageId;
      this.scrollRequestPageId = pageId;
      this.scrollRequestNonce++;
    },
    async createPageInternal(index: number): Promise<Page> {
      if (!this.project) throw new Error("No project");
      const now = Date.now();
      const page: Page = {
        id: newId(),
        projectId: this.project.id,
        index,
        name: `Page ${index + 1}`,
        width: DEFAULT_PAGE_SIZE.width,
        height: DEFAULT_PAGE_SIZE.height,
        background: "blank",
        originX: 0,
        originY: 0,
        createdAt: now,
        updatedAt: now,
      };
      await storage.putPage(page);
      return page;
    },
    async addPage() {
      if (!this.project) return;
      const page = await this.createPageInternal(this.pages.length);
      this.pages = [...this.pages, page];
      this.project.pageOrder = this.pages.map((p) => p.id);
      this.project.updatedAt = Date.now();
      await storage.putProject({ ...this.project });
      useLiveStore().broadcast({
        t: "page-add",
        page,
        pages: [...this.pages],
      });
      // New sheet has no strokes, so in notebook mode just scroll to it (all
      // strokes already in memory); Free mode switches to it.
      if (this.notebookMode !== "off") this.requestScrollToSheet(page.id);
      else await this.selectPage(page.id);
      await useProjectsStore().touch(this.project.id);
    },
    async deletePage(pageId: string) {
      if (!this.project) return;
      if (this.pages.length <= 1) return;
      // For replay, a deleted sheet's content simply vanishes at this point.
      this._record({ op: "page-clear", pageId });
      await storage.deletePage(pageId);
      this.pages = this.pages.filter((p) => p.id !== pageId).map((p, i) => ({ ...p, index: i }));
      for (const p of this.pages) await storage.putPage(p);
      this.project.pageOrder = this.pages.map((p) => p.id);
      this.project.updatedAt = Date.now();
      await storage.putProject({ ...this.project });
      const fallback = this.pages[0].id;
      useLiveStore().broadcast({
        t: "page-delete",
        pageId,
        pages: [...this.pages],
        fallbackPageId: fallback,
      });
      if (this.notebookMode !== "off") {
        // Continuous stack: drop the removed sheet's strokes/shapes/images from
        // memory and re-point the active sheet without a page switch.
        this.strokes = this.strokes.filter((s) => s.pageId !== pageId);
        this.shapes = this.shapes.filter((s) => s.pageId !== pageId);
        this.images = this.images.filter((i) => i.pageId !== pageId);
        if (this.currentPageId === pageId) this.setActiveSheet(fallback);
      } else if (this.currentPageId === pageId) {
        await this.selectPage(fallback);
      }
    },
    async renamePage(pageId: string, name: string) {
      const page = this.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.name = name.trim() || page.name;
      page.updatedAt = Date.now();
      await storage.putPage({ ...page });
      useLiveStore().broadcast({ t: "page-rename", pageId, name: page.name });
    },
    async setPageBackground(pageId: string, background: Page["background"]) {
      const page = this.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.background = background;
      page.updatedAt = Date.now();
      await storage.putPage({ ...page });
      useLiveStore().broadcast({ t: "page-background", pageId, background });
    },
    async setPageSize(pageId: string, width: number, height: number) {
      const page = this.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.width = width;
      page.height = height;
      page.updatedAt = Date.now();
      await storage.putPage({ ...page });
      useLiveStore().broadcast({ t: "page-size", pageId, width, height });
    },
    // Append a forward content op to the recording log. No-op unless the project
    // has recordReplay on. Fire-and-forget so it never blocks drawing; events are
    // appended in call order (seq autoincrements).
    _record(op: ReplayOp) {
      const project = this.project;
      if (!project?.recordReplay) return;
      storage.appendEvent({ projectId: project.id, t: Date.now(), op }).catch(() => {});
    },
    // Net effect of an undo/redo on a whole page (area-erase): wipe the page,
    // then re-add the exact stroke/shape set it should now hold. The seq
    // autoincrement preserves this order even though the timestamps tie.
    _recordPageReset(pageId: string, strokes: Stroke[], shapes: Shape[]) {
      if (!this.project?.recordReplay) return;
      this._record({ op: "page-clear", pageId });
      for (const s of strokes) this._record({ op: "stroke-add", stroke: s });
      for (const s of shapes) this._record({ op: "shape-add", shape: s });
    },
    // The layer id new content on `pageId` should carry. Only stamps when the
    // content is on the current page (whose layers are loaded); content created on
    // another sheet in notebook mode gets no layer and so always renders.
    _layerFor(pageId: string): string | undefined {
      if (pageId !== this.currentPageId) return undefined;
      return this.currentLayerId ?? undefined;
    },
    // True if the item's layer is loaded and locked. Unknown layers (other sheets,
    // legacy content) are treated as unlocked.
    _isLayerLocked(layerId?: string): boolean {
      if (!layerId) return false;
      const layer = this.layers.find((l) => l.id === layerId);
      return layer ? layer.locked : false;
    },
    // Move every stroke/shape/image/text on `fromLayerId` to `toLayerId` (in memory
    // and storage). Used when a layer is deleted — its content survives on another.
    async _reassignLayerContent(fromLayerId: string, toLayerId: string | undefined) {
      const movedStrokes = this.strokes.filter((s) => s.layerId === fromLayerId);
      if (movedStrokes.length) {
        this.strokes = this.strokes.map((s) =>
          s.layerId === fromLayerId ? { ...s, layerId: toLayerId } : s,
        );
        for (const s of movedStrokes) await storage.putStroke({ ...s, layerId: toLayerId });
      }
      const movedShapes = this.shapes.filter((s) => s.layerId === fromLayerId);
      if (movedShapes.length) {
        this.shapes = this.shapes.map((s) =>
          s.layerId === fromLayerId ? { ...s, layerId: toLayerId } : s,
        );
        for (const s of movedShapes) await storage.putShape({ ...s, layerId: toLayerId });
      }
      const movedImages = this.images.filter((i) => i.layerId === fromLayerId);
      if (movedImages.length) {
        this.images = this.images.map((i) =>
          i.layerId === fromLayerId ? { ...i, layerId: toLayerId } : i,
        );
        for (const i of movedImages) await storage.putImage({ ...i, layerId: toLayerId });
      }
      for (const page of this.pages) {
        const texts = page.texts ?? [];
        if (texts.some((t) => t.layerId === fromLayerId)) {
          page.texts = texts.map((t) =>
            t.layerId === fromLayerId ? { ...t, layerId: toLayerId } : t,
          );
          await storage.putPage({ ...page });
        }
      }
    },
    // Restore content captured in a layer-delete entry back onto its original layer
    // (undo). Replaces any reassigned copies by id.
    async _restoreLayerContent(entry: {
      layer: Layer;
      strokes: Stroke[];
      texts: TextItem[];
      shapes: Shape[];
      images: ImageItem[];
    }) {
      if (entry.strokes.length) {
        const ids = new Set(entry.strokes.map((s) => s.id));
        this.strokes = [...this.strokes.filter((s) => !ids.has(s.id)), ...entry.strokes];
        for (const s of entry.strokes) await storage.putStroke(s);
      }
      if (entry.shapes.length) {
        const ids = new Set(entry.shapes.map((s) => s.id));
        this.shapes = [...this.shapes.filter((s) => !ids.has(s.id)), ...entry.shapes];
        for (const s of entry.shapes) await storage.putShape(s);
      }
      if (entry.images.length) {
        const ids = new Set(entry.images.map((i) => i.id));
        this.images = [...this.images.filter((i) => !ids.has(i.id)), ...entry.images];
        for (const i of entry.images) await storage.putImage(i);
      }
      if (entry.texts.length) {
        const page = this.pages.find((p) => p.id === entry.layer.pageId);
        if (page) {
          const ids = new Set(entry.texts.map((t) => t.id));
          page.texts = [...(page.texts ?? []).filter((t) => !ids.has(t.id)), ...entry.texts];
          await storage.putPage({ ...page });
        }
      }
    },
    async eraseStroke(strokeId: string) {
      const stroke = this.strokes.find((s) => s.id === strokeId);
      if (!stroke) return;
      // Don't erase content that lives on a locked layer.
      if (this._isLayerLocked(stroke.layerId)) return;
      this.strokes = this.strokes.filter((s) => s.id !== strokeId);
      this.history = [...this.history, { kind: "stroke-erase", stroke }];
      this.redoStack = [];
      await storage.deleteStroke(strokeId);
      this._record({ op: "stroke-remove", pageId: stroke.pageId, id: strokeId });
      useLiveStore().broadcast({ t: "stroke-delete", pageId: stroke.pageId, strokeId });
    },
    async commitStroke(input: Stroke) {
      this.saving++;
      try {
        const stroke: Stroke = { ...input, layerId: this._layerFor(input.pageId) };
        this.strokes = [...this.strokes, stroke];
        dlog(
          `commit id${stroke.id.slice(-4)} pts${stroke.points.length} total${this.strokes.length}`,
        );
        this.history = [...this.history, { kind: "stroke-add", stroke }];
        this.redoStack = [];
        await storage.putStroke(stroke);
        this._record({ op: "stroke-add", stroke });
        useLiveStore().broadcast({ t: "stroke-commit", stroke });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async commitText(input: TextItem) {
      const page = this.pages.find((p) => p.id === input.pageId);
      if (!page) return;
      this.saving++;
      try {
        const text: TextItem = { ...input, layerId: this._layerFor(input.pageId) };
        const prev = (page.texts ?? []).find((t) => t.id === text.id) ?? null;
        page.texts = [...(page.texts ?? []).filter((t) => t.id !== text.id), text];
        page.updatedAt = Date.now();
        await storage.putPage({ ...page });
        this.history = [...this.history, { kind: "text-upsert", prev, next: text }];
        this.redoStack = [];
        this._record({ op: "text-set", text });
        useLiveStore().broadcast({ t: "text-commit", text });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async commitShape(input: Shape) {
      this.saving++;
      try {
        const shape: Shape = { ...input, layerId: this._layerFor(input.pageId) };
        this.shapes = [...this.shapes, shape];
        this.history = [...this.history, { kind: "shape-add", shape }];
        this.redoStack = [];
        await storage.putShape(shape);
        this._record({ op: "shape-add", shape });
        useLiveStore().broadcast({ t: "shape-commit", shape });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async deleteShape(shapeId: string) {
      const shape = this.shapes.find((s) => s.id === shapeId);
      if (!shape) return;
      this.shapes = this.shapes.filter((s) => s.id !== shapeId);
      this.history = [...this.history, { kind: "shape-erase", shape }];
      this.redoStack = [];
      await storage.deleteShape(shapeId);
      this._record({ op: "shape-remove", pageId: shape.pageId, id: shapeId });
      useLiveStore().broadcast({ t: "shape-delete", pageId: shape.pageId, shapeId });
    },
    async deleteText(pageId: string, textId: string) {
      const page = this.pages.find((p) => p.id === pageId);
      if (!page?.texts) return;
      const text = page.texts.find((t) => t.id === textId);
      if (!text) return;
      page.texts = page.texts.filter((t) => t.id !== textId);
      page.updatedAt = Date.now();
      await storage.putPage({ ...page });
      this.history = [...this.history, { kind: "text-delete", text }];
      this.redoStack = [];
      this._record({ op: "text-remove", pageId, id: textId });
      useLiveStore().broadcast({ t: "text-delete", pageId, textId });
    },
    async undo() {
      const entry = this.history[this.history.length - 1];
      if (!entry) return;
      this.history = this.history.slice(0, -1);
      this.redoStack = [...this.redoStack, entry];
      if (entry.kind === "stroke-add") {
        this.strokes = this.strokes.filter((s) => s.id !== entry.stroke.id);
        await storage.deleteStroke(entry.stroke.id);
        this._record({ op: "stroke-remove", pageId: entry.stroke.pageId, id: entry.stroke.id });
        useLiveStore().broadcast({
          t: "stroke-delete",
          pageId: entry.stroke.pageId,
          strokeId: entry.stroke.id,
        });
      } else if (entry.kind === "stroke-erase") {
        this.strokes = [...this.strokes, entry.stroke];
        await storage.putStroke(entry.stroke);
        this._record({ op: "stroke-add", stroke: entry.stroke });
        useLiveStore().broadcast({ t: "stroke-commit", stroke: entry.stroke });
      } else if (entry.kind === "text-upsert") {
        const page = this.pages.find((p) => p.id === entry.next.pageId);
        if (page) {
          if (entry.prev) {
            page.texts = [...(page.texts ?? []).filter((t) => t.id !== entry.next.id), entry.prev];
            await storage.putPage({ ...page });
            this._record({ op: "text-set", text: entry.prev });
            useLiveStore().broadcast({ t: "text-commit", text: entry.prev });
          } else {
            page.texts = (page.texts ?? []).filter((t) => t.id !== entry.next.id);
            await storage.putPage({ ...page });
            this._record({ op: "text-remove", pageId: page.id, id: entry.next.id });
            useLiveStore().broadcast({ t: "text-delete", pageId: page.id, textId: entry.next.id });
          }
        }
      } else if (entry.kind === "text-delete") {
        const page = this.pages.find((p) => p.id === entry.text.pageId);
        if (page) {
          page.texts = [...(page.texts ?? []).filter((t) => t.id !== entry.text.id), entry.text];
          await storage.putPage({ ...page });
          this._record({ op: "text-set", text: entry.text });
          useLiveStore().broadcast({ t: "text-commit", text: entry.text });
        }
      } else if (entry.kind === "area-erase") {
        this.strokes = [...this.strokes.filter((s) => s.pageId !== entry.pageId), ...entry.before];
        this.shapes = [
          ...this.shapes.filter((s) => s.pageId !== entry.pageId),
          ...entry.shapesBefore,
        ];
        await storage.deleteStrokesForPage(entry.pageId);
        for (const s of entry.before) await storage.putStroke(s);
        await storage.deleteShapesForPage(entry.pageId);
        for (const s of entry.shapesBefore) await storage.putShape(s);
        this._recordPageReset(entry.pageId, entry.before, entry.shapesBefore);
        useLiveStore().broadcast({
          t: "page-set",
          pageId: entry.pageId,
          pages: [...this.pages],
          strokes: entry.before,
          shapes: entry.shapesBefore,
        });
      } else if (entry.kind === "shape-add") {
        this.shapes = this.shapes.filter((s) => s.id !== entry.shape.id);
        await storage.deleteShape(entry.shape.id);
        this._record({ op: "shape-remove", pageId: entry.shape.pageId, id: entry.shape.id });
        useLiveStore().broadcast({
          t: "shape-delete",
          pageId: entry.shape.pageId,
          shapeId: entry.shape.id,
        });
      } else if (entry.kind === "shape-erase") {
        this.shapes = [...this.shapes, entry.shape];
        await storage.putShape(entry.shape);
        this._record({ op: "shape-add", shape: entry.shape });
        useLiveStore().broadcast({ t: "shape-commit", shape: entry.shape });
      } else if (entry.kind === "image-add") {
        this.images = this.images.filter((i) => i.id !== entry.image.id);
        await storage.deleteImage(entry.image.id);
        this._record({ op: "image-remove", pageId: entry.image.pageId, id: entry.image.id });
      } else if (entry.kind === "image-erase") {
        this.images = [...this.images, entry.image];
        await storage.putImage(entry.image);
        this._record({ op: "image-set", image: entry.image });
      } else if (entry.kind === "layer-add") {
        // Undo add: drop the (empty) layer.
        this.layers = this.layers.filter((l) => l.id !== entry.layer.id);
        await storage.deleteLayer(entry.layer.id);
        if (this.currentLayerId === entry.layer.id) {
          const preferred = this.layers.find((l) => l.visible && !l.locked) ?? this.layers[0];
          this.currentLayerId = preferred?.id ?? null;
        }
      } else if (entry.kind === "layer-delete") {
        // Undo delete: restore the layer and move its content back onto it.
        this.layers = [...this.layers, entry.layer].sort((a, b) => a.index - b.index);
        await storage.putLayer(entry.layer);
        await this._restoreLayerContent(entry);
      }
    },
    async redo() {
      const entry = this.redoStack[this.redoStack.length - 1];
      if (!entry) return;
      this.redoStack = this.redoStack.slice(0, -1);
      this.history = [...this.history, entry];
      if (entry.kind === "stroke-add") {
        this.strokes = [...this.strokes, entry.stroke];
        await storage.putStroke(entry.stroke);
        this._record({ op: "stroke-add", stroke: entry.stroke });
        useLiveStore().broadcast({ t: "stroke-commit", stroke: entry.stroke });
      } else if (entry.kind === "stroke-erase") {
        this.strokes = this.strokes.filter((s) => s.id !== entry.stroke.id);
        await storage.deleteStroke(entry.stroke.id);
        this._record({ op: "stroke-remove", pageId: entry.stroke.pageId, id: entry.stroke.id });
        useLiveStore().broadcast({
          t: "stroke-delete",
          pageId: entry.stroke.pageId,
          strokeId: entry.stroke.id,
        });
      } else if (entry.kind === "text-upsert") {
        const page = this.pages.find((p) => p.id === entry.next.pageId);
        if (page) {
          page.texts = [...(page.texts ?? []).filter((t) => t.id !== entry.next.id), entry.next];
          await storage.putPage({ ...page });
          this._record({ op: "text-set", text: entry.next });
          useLiveStore().broadcast({ t: "text-commit", text: entry.next });
        }
      } else if (entry.kind === "text-delete") {
        const page = this.pages.find((p) => p.id === entry.text.pageId);
        if (page) {
          page.texts = (page.texts ?? []).filter((t) => t.id !== entry.text.id);
          await storage.putPage({ ...page });
          this._record({ op: "text-remove", pageId: page.id, id: entry.text.id });
          useLiveStore().broadcast({ t: "text-delete", pageId: page.id, textId: entry.text.id });
        }
      } else if (entry.kind === "area-erase") {
        this.strokes = [...this.strokes.filter((s) => s.pageId !== entry.pageId), ...entry.after];
        this.shapes = [
          ...this.shapes.filter((s) => s.pageId !== entry.pageId),
          ...entry.shapesAfter,
        ];
        await storage.deleteStrokesForPage(entry.pageId);
        for (const s of entry.after) await storage.putStroke(s);
        await storage.deleteShapesForPage(entry.pageId);
        for (const s of entry.shapesAfter) await storage.putShape(s);
        this._recordPageReset(entry.pageId, entry.after, entry.shapesAfter);
        useLiveStore().broadcast({
          t: "page-set",
          pageId: entry.pageId,
          pages: [...this.pages],
          strokes: entry.after,
          shapes: entry.shapesAfter,
        });
      } else if (entry.kind === "shape-add") {
        this.shapes = [...this.shapes, entry.shape];
        await storage.putShape(entry.shape);
        this._record({ op: "shape-add", shape: entry.shape });
        useLiveStore().broadcast({ t: "shape-commit", shape: entry.shape });
      } else if (entry.kind === "shape-erase") {
        this.shapes = this.shapes.filter((s) => s.id !== entry.shape.id);
        await storage.deleteShape(entry.shape.id);
        this._record({ op: "shape-remove", pageId: entry.shape.pageId, id: entry.shape.id });
        useLiveStore().broadcast({
          t: "shape-delete",
          pageId: entry.shape.pageId,
          shapeId: entry.shape.id,
        });
      } else if (entry.kind === "image-add") {
        this.images = [...this.images, entry.image];
        await storage.putImage(entry.image);
        this._record({ op: "image-set", image: entry.image });
      } else if (entry.kind === "image-erase") {
        this.images = this.images.filter((i) => i.id !== entry.image.id);
        await storage.deleteImage(entry.image.id);
        this._record({ op: "image-remove", pageId: entry.image.pageId, id: entry.image.id });
      } else if (entry.kind === "layer-add") {
        // Redo add: restore the layer and make it current.
        this.layers = [...this.layers, entry.layer].sort((a, b) => a.index - b.index);
        await storage.putLayer(entry.layer);
        this.currentLayerId = entry.layer.id;
      } else if (entry.kind === "layer-delete") {
        // Redo delete: remove the layer and re-orphan its content to the bottom layer.
        this.layers = this.layers.filter((l) => l.id !== entry.layer.id);
        await storage.deleteLayer(entry.layer.id);
        await this._reassignLayerContent(entry.layer.id, this.layers[0]?.id);
        if (this.currentLayerId === entry.layer.id) {
          const preferred = this.layers.find((l) => l.visible && !l.locked) ?? this.layers[0];
          this.currentLayerId = preferred?.id ?? null;
        }
      }
    },
    async commitImage(input: ImageItem) {
      this.saving++;
      try {
        const image: ImageItem = { ...input, layerId: this._layerFor(input.pageId) };
        this.images = [...this.images, image];
        this.history = [...this.history, { kind: "image-add", image }];
        this.redoStack = [];
        await storage.putImage(image);
        this._record({ op: "image-set", image });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async deleteImage(imageId: string) {
      const image = this.images.find((i) => i.id === imageId);
      if (!image) return;
      this.images = this.images.filter((i) => i.id !== imageId);
      this.history = [...this.history, { kind: "image-erase", image }];
      this.redoStack = [];
      await storage.deleteImage(imageId);
      this._record({ op: "image-remove", pageId: image.pageId, id: imageId });
    },
    async moveImage(imageId: string, x: number, y: number) {
      const image = this.images.find((i) => i.id === imageId);
      if (!image) return;
      const prev = { ...image };
      image.x = x;
      image.y = y;
      // A move is a fresh edit: invalidate any outstanding redo branch (consistent
      // with all other mutations). The move itself is not pushed to undo history.
      this.redoStack = [];
      await storage.putImage({ ...image });
      this._record({ op: "image-set", image: { ...image } });
      if (this.project) await useProjectsStore().touch(this.project.id);
      return prev;
    },
    // Resize (and reposition, since corner-drag anchors the opposite corner).
    // Like moveImage: persisted, clears redo, not pushed to undo history.
    async resizeImage(imageId: string, x: number, y: number, width: number, height: number) {
      const image = this.images.find((i) => i.id === imageId);
      if (!image) return;
      image.x = x;
      image.y = y;
      image.width = width;
      image.height = height;
      this.redoStack = [];
      await storage.putImage({ ...image });
      this._record({ op: "image-set", image: { ...image } });
      if (this.project) await useProjectsStore().touch(this.project.id);
    },
    // Stacking order vs the drawing. Front = above strokes/shapes/text and above
    // other front images; back = below the drawing and below other back images.
    async bringImageToFront(imageId: string) {
      const image = this.images.find((i) => i.id === imageId);
      if (!image) return;
      const maxZ = this.images.reduce((m, i) => Math.max(m, i.z ?? 0), 0);
      image.z = maxZ + 1;
      this.redoStack = [];
      await storage.putImage({ ...image });
      this._record({ op: "image-set", image: { ...image } });
      if (this.project) await useProjectsStore().touch(this.project.id);
    },
    async sendImageToBack(imageId: string) {
      const image = this.images.find((i) => i.id === imageId);
      if (!image) return;
      const minZ = this.images.reduce((m, i) => Math.min(m, i.z ?? 0), 0);
      image.z = minZ - 1;
      this.redoStack = [];
      await storage.putImage({ ...image });
      this._record({ op: "image-set", image: { ...image } });
      if (this.project) await useProjectsStore().touch(this.project.id);
    },
    async clearPage() {
      if (!this.currentPageId) return;
      await storage.deleteStrokesForPage(this.currentPageId);
      await storage.deleteShapesForPage(this.currentPageId);
      await storage.deleteImagesForPage(this.currentPageId);
      await storage.deleteLayersForPage(this.currentPageId);
      const pageId = this.currentPageId;
      this.strokes = [];
      this.shapes = [];
      this.images = [];
      this.history = [];
      this.redoStack = [];
      // Rebuild the single default layer for the now-empty page.
      await this.loadLayers(pageId);
      this._record({ op: "page-clear", pageId });
      useLiveStore().broadcast({ t: "clear-page", pageId });
    },
    // ── Layers ────────────────────────────────────────────────────────────────
    async addLayer() {
      if (!this.currentPageId) return;
      const nextIndex = this.layers.length;
      const layer: Layer = {
        id: newId(),
        pageId: this.currentPageId,
        name: `Layer ${nextIndex + 1}`,
        visible: true,
        locked: false,
        index: nextIndex,
        createdAt: Date.now(),
      };
      await storage.putLayer(layer);
      this.layers = [...this.layers, layer];
      this.currentLayerId = layer.id;
      this.history = [...this.history, { kind: "layer-add", layer }];
      this.redoStack = [];
    },
    async deleteLayer(layerId: string) {
      if (this.layers.length <= 1) return; // keep at least one layer
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const remaining = this.layers.filter((l) => l.id !== layerId);
      const bottom = remaining[0];
      // Capture this layer's content (original assignment) for undo.
      const page = this.pages.find((p) => p.id === layer.pageId);
      const strokes = this.strokes.filter((s) => s.layerId === layerId);
      const shapes = this.shapes.filter((s) => s.layerId === layerId);
      const images = this.images.filter((i) => i.layerId === layerId);
      const texts = (page?.texts ?? []).filter((t) => t.layerId === layerId);
      // Content survives on the bottom-most remaining layer.
      await this._reassignLayerContent(layerId, bottom.id);
      await storage.deleteLayer(layerId);
      const renumbered = remaining.map((l, i) => ({ ...l, index: i }));
      this.layers = renumbered;
      for (const l of renumbered) await storage.putLayer(l);
      if (this.currentLayerId === layerId) {
        const preferred = renumbered.find((l) => l.visible && !l.locked) ?? renumbered[0];
        this.currentLayerId = preferred?.id ?? null;
      }
      this.history = [
        ...this.history,
        { kind: "layer-delete", layer, strokes, texts, shapes, images },
      ];
      this.redoStack = [];
    },
    async renameLayer(layerId: string, name: string) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.name = name.trim() || layer.name;
      await storage.putLayer({ ...layer });
    },
    async toggleLayerVisibility(layerId: string) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.visible = !layer.visible;
      await storage.putLayer({ ...layer });
      // Hiding the current layer? Move drawing focus to another drawable layer.
      if (!layer.visible && this.currentLayerId === layerId) {
        const preferred = this.layers.find((l) => l.id !== layerId && l.visible && !l.locked);
        if (preferred) this.currentLayerId = preferred.id;
      }
    },
    async toggleLayerLock(layerId: string) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      layer.locked = !layer.locked;
      await storage.putLayer({ ...layer });
      if (layer.locked && this.currentLayerId === layerId) {
        const preferred = this.layers.find((l) => l.id !== layerId && l.visible && !l.locked);
        if (preferred) this.currentLayerId = preferred.id;
      }
    },
    selectLayer(layerId: string) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer?.visible || layer.locked) return;
      this.currentLayerId = layerId;
    },
    async reorderLayer(layerId: string, newIndex: number) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const clamped = Math.max(0, Math.min(this.layers.length - 1, newIndex));
      if (layer.index === clamped) return;
      const without = this.layers.filter((l) => l.id !== layerId);
      without.splice(clamped, 0, layer);
      const renumbered = without.map((l, i) => ({ ...l, index: i }));
      this.layers = renumbered;
      for (const l of renumbered) await storage.putLayer(l);
    },
    async moveLayerUp(layerId: string) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (layer) await this.reorderLayer(layerId, layer.index + 1);
    },
    async moveLayerDown(layerId: string) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (layer) await this.reorderLayer(layerId, layer.index - 1);
    },
    setTool(t: Tool) {
      this.tool = t;
    },
    setPenType(pt: PenType) {
      this.penType = pt;
    },
    setColor(c: string) {
      this.color = c;
    },
    setSize(s: number) {
      this.toolSizes[this.tool] = s;
    },
    setEraserMode(mode: "stroke" | "area") {
      this.eraserMode = mode;
    },
    setEraserShape(shape: "circle" | "square") {
      this.eraserShape = shape;
    },
    // Area eraser: remove the parts of each stroke that fall under the eraser.
    // Clips the polyline against the eraser shape — segments crossing the eraser
    // are cut exactly at the boundary, so ink passing through with no recorded
    // point inside is still erased, and points outside are kept (no over-erase).
    // In-memory and synchronous (called rapidly during a drag); persist via flushPage.
    eraseArea(pageId: string, wx: number, wy: number, radius: number): boolean {
      const square = this.eraserShape === "square";
      const r2 = radius * radius;
      const insideAt = (x: number, y: number): boolean =>
        square
          ? Math.abs(x - wx) <= radius && Math.abs(y - wy) <= radius
          : (x - wx) ** 2 + (y - wy) ** 2 <= r2;
      // The sub-interval [t1,t2] of segment A→B that lies inside the eraser, else null.
      const insideInterval = (a: StrokePoint, b: StrokePoint): [number, number] | null =>
        eraserHitInterval(a.x, a.y, b.x, b.y, wx, wy, radius, square);
      const lerp = (a: StrokePoint, b: StrokePoint, t: number): StrokePoint => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        p: a.p + (b.p - a.p) * t,
        t: a.t + (b.t - a.t) * t,
      });

      const survivors: Stroke[] = [];
      let changed = false;
      for (const stroke of this.strokes) {
        if (stroke.pageId !== pageId || this._isLayerLocked(stroke.layerId)) {
          survivors.push(stroke);
          continue;
        }
        const pts = stroke.points;
        const runs: StrokePoint[][] = [];
        let run: StrokePoint[] = [];
        let hit = false;
        const flush = () => {
          if (run.length >= 2) runs.push(run);
          run = [];
        };
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) {
            if (insideAt(pts[0].x, pts[0].y)) hit = true;
            else run.push(pts[0]);
            continue;
          }
          const a = pts[i - 1];
          const b = pts[i];
          const aIn = insideAt(a.x, a.y);
          const bIn = insideAt(b.x, b.y);
          if (!aIn && !bIn) {
            const iv = insideInterval(a, b);
            if (iv && iv[1] - iv[0] > 1e-6) {
              // Segment passes through the eraser — cut it.
              hit = true;
              run.push(lerp(a, b, iv[0]));
              flush();
              run.push(lerp(a, b, iv[1]));
              run.push(b);
            } else {
              run.push(b);
            }
          } else if (aIn && !bIn) {
            // Exiting the eraser — start a new run at the boundary.
            hit = true;
            const iv = insideInterval(a, b);
            run.push(lerp(a, b, iv ? iv[1] : 0));
            run.push(b);
          } else if (!aIn && bIn) {
            // Entering the eraser — end the current run at the boundary.
            hit = true;
            const iv = insideInterval(a, b);
            run.push(lerp(a, b, iv ? iv[0] : 1));
            flush();
          } else {
            // Both endpoints inside — drop, ending any open run.
            hit = true;
            flush();
          }
        }
        flush();
        if (!hit) {
          survivors.push(stroke);
          continue;
        }
        changed = true;
        runs.forEach((rpts, i) => {
          survivors.push({ ...stroke, id: i === 0 ? stroke.id : newId(), points: rpts });
        });
      }
      if (changed) this.strokes = survivors;
      return changed;
    },
    // Call before starting an area-erase gesture to snapshot the before-state.
    beginAreaErase(pageId: string) {
      this._areaEraseBefore = this.strokes.filter((s) => s.pageId === pageId);
      this._areaEraseShapesBefore = this.shapes.filter((s) => s.pageId === pageId);
    },
    // Area eraser over shapes: clip each touched shape's outline against the
    // eraser and keep the surviving pieces as crisp `line` shapes, so erasing a
    // part removes only that part while the rest stays sharp (not pen-rasterized).
    // In-memory + synchronous; persisted by flushPage. Mirrors eraseArea.
    eraseAreaShapes(pageId: string, wx: number, wy: number, radius: number): boolean {
      const square = this.eraserShape === "square";
      const survivors: Shape[] = [];
      let changed = false;
      for (const shape of this.shapes) {
        if (shape.pageId !== pageId || this._isLayerLocked(shape.layerId)) {
          survivors.push(shape);
          continue;
        }
        const pieces: Array<[number, number, number, number]> = [];
        let hit = false;
        for (const [ax, ay, bx, by] of shapeSegments(shape)) {
          const iv = eraserHitInterval(ax, ay, bx, by, wx, wy, radius, square);
          if (!iv || iv[1] - iv[0] <= 1e-6) {
            pieces.push([ax, ay, bx, by]);
            continue;
          }
          hit = true;
          const [t1, t2] = iv;
          if (t1 > 1e-6) pieces.push([ax, ay, ax + (bx - ax) * t1, ay + (by - ay) * t1]);
          if (t2 < 1 - 1e-6) pieces.push([ax + (bx - ax) * t2, ay + (by - ay) * t2, bx, by]);
        }
        if (!hit) {
          survivors.push(shape);
          continue;
        }
        changed = true;
        for (const [ax, ay, bx, by] of pieces) {
          if (Math.hypot(bx - ax, by - ay) < 0.5) continue;
          survivors.push({ ...shape, id: newId(), type: "line", x1: ax, y1: ay, x2: bx, y2: by });
        }
      }
      if (changed) this.shapes = survivors;
      return changed;
    },
    // Persist the current strokes + shapes of a page after an area-erase gesture.
    async flushPage(pageId: string) {
      this.saving++;
      try {
        const after = this.strokes.filter((s) => s.pageId === pageId);
        const before = this._areaEraseBefore ?? after;
        this._areaEraseBefore = null;
        const shapesAfter = this.shapes.filter((s) => s.pageId === pageId);
        const shapesBefore = this._areaEraseShapesBefore ?? shapesAfter;
        this._areaEraseShapesBefore = null;
        if (before !== after || shapesBefore !== shapesAfter) {
          this.history = [
            ...this.history,
            { kind: "area-erase", pageId, before, after, shapesBefore, shapesAfter },
          ];
          this.redoStack = [];
        }
        await storage.deleteStrokesForPage(pageId);
        for (const s of this.strokes) if (s.pageId === pageId) await storage.putStroke(s);
        await storage.deleteShapesForPage(pageId);
        for (const s of shapesAfter) await storage.putShape(s);
        // Record the area-erase as remove/add diffs so replay shows the cut.
        if (this.project?.recordReplay) {
          const afterStrokeIds = new Set(after.map((s) => s.id));
          for (const s of before) {
            if (!afterStrokeIds.has(s.id)) this._record({ op: "stroke-remove", pageId, id: s.id });
          }
          const beforeStrokeIds = new Set(before.map((s) => s.id));
          for (const s of after) {
            if (!beforeStrokeIds.has(s.id)) this._record({ op: "stroke-add", stroke: s });
          }
          const afterShapeIds = new Set(shapesAfter.map((s) => s.id));
          for (const s of shapesBefore) {
            if (!afterShapeIds.has(s.id)) this._record({ op: "shape-remove", pageId, id: s.id });
          }
          const beforeShapeIds = new Set(shapesBefore.map((s) => s.id));
          for (const s of shapesAfter) {
            if (!beforeShapeIds.has(s.id)) this._record({ op: "shape-add", shape: s });
          }
        }
        useLiveStore().broadcast({
          t: "page-set",
          pageId,
          pages: [...this.pages],
          strokes: after,
          shapes: shapesAfter,
        });
      } finally {
        this.saving--;
      }
    },
    setCamera(x: number, y: number, zoom: number) {
      this.camera = { x, y, zoom };
    },
    resetCamera() {
      this.camera = { x: 0, y: 0, zoom: 1 };
    },
    setDrawing(active: boolean) {
      this.isDrawing = active;
    },
    setPresenterMode(mode: "off" | "laser" | "spotlight") {
      this.presenterMode = mode;
      if (mode === "off") {
        useLiveStore().broadcast({ t: "presenter-off" });
      }
    },
    async setNotebookMode(mode: NotebookMode) {
      if (!this.project || this.project.notebookMode === mode) return;
      const wasOff = (this.project.notebookMode ?? "off") === "off";
      this.project.notebookMode = mode;
      this.project.updatedAt = Date.now();
      await storage.putProject({ ...this.project });
      // Entering the stack needs every sheet's strokes/shapes/images; leaving it
      // restores the Free-mode single-page invariant.
      if (wasOff && mode !== "off") {
        await this.loadAllStrokes();
        await this.loadAllShapes();
        await this.loadAllImages();
      } else if (!wasOff && mode === "off" && this.currentPageId) {
        await this.loadStrokes(this.currentPageId);
        await this.loadShapes(this.currentPageId);
        await this.loadImages(this.currentPageId);
      }
      // Re-snapshot live viewers onto the new mode/stack (strokes sent chunked).
      useLiveStore().broadcastNotebookSync(
        mode,
        this.notebookLayout,
        [...this.pages],
        [...this.strokes],
        [...this.shapes],
      );
    },
    async setNotebookLayout(layout: NotebookLayout) {
      if (!this.project || this.project.notebookLayout === layout) return;
      this.project.notebookLayout = layout;
      this.project.updatedAt = Date.now();
      await storage.putProject({ ...this.project });
      useLiveStore().broadcast({ t: "notebook-layout", layout });
    },
    // Toggle opt-in session recording. Enabling starts a fresh log whose first
    // events are the current content of every page, so replay has a baseline to
    // apply later ops onto. Disabling just stops appending (the log is kept and
    // reset on the next enable).
    async setRecordReplay(on: boolean) {
      if (!this.project || (this.project.recordReplay ?? false) === on) return;
      this.project.recordReplay = on;
      this.project.updatedAt = Date.now();
      await storage.putProject({ ...this.project });
      if (!on) return;
      const projectId = this.project.id;
      await storage.clearEvents(projectId);
      const now = Date.now();
      for (const page of this.pages) {
        const [strokes, shapes, images] = await Promise.all([
          storage.listStrokes(page.id),
          storage.listShapes(page.id),
          storage.listImages(page.id),
        ]);
        const ops: ReplayOp[] = [
          ...strokes.map((stroke) => ({ op: "stroke-add", stroke }) as ReplayOp),
          ...shapes.map((shape) => ({ op: "shape-add", shape }) as ReplayOp),
          ...images.map((image) => ({ op: "image-set", image }) as ReplayOp),
          ...(page.texts ?? []).map((text) => ({ op: "text-set", text }) as ReplayOp),
        ];
        for (const op of ops) await storage.appendEvent({ projectId, t: now, op, baseline: true });
      }
    },
  },
});
