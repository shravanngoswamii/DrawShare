import { defineStore } from "pinia";
import { storage } from "@/adapters/storage/indexedDB";
import { newId } from "@/core/ids";
import type { HistoryEntry, Page, Project, Shape, Stroke, TextItem, Tool } from "@/core/types";
import { dlog } from "@/debug";
import { useLiveStore } from "./live";
import { DEFAULT_PAGE_SIZE, useProjectsStore } from "./projects";

interface EditorState {
  project: Project | undefined;
  pages: Page[];
  currentPageId: string | undefined;
  strokes: Stroke[];
  shapes: Shape[];
  tool: Tool;
  color: string;
  toolSizes: Record<Tool, number>;
  opacity: number;
  eraserMode: "stroke" | "area";
  eraserShape: "circle" | "square";
  saving: number;
  history: HistoryEntry[];
  redoStack: HistoryEntry[];
  _areaEraseBefore: Stroke[] | null;
  camera: { x: number; y: number; zoom: number };
  isDrawing: boolean;
}

export const useEditorStore = defineStore("editor", {
  state: (): EditorState => ({
    project: undefined,
    pages: [],
    currentPageId: undefined,
    strokes: [],
    shapes: [],
    tool: "pen",
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
    eraserMode: "stroke",
    eraserShape: "circle",
    saving: 0,
    history: [],
    redoStack: [],
    _areaEraseBefore: null,
    camera: { x: 0, y: 0, zoom: 1 },
    isDrawing: false,
  }),
  getters: {
    currentPage(state): Page | undefined {
      return state.pages.find((p) => p.id === state.currentPageId);
    },
    size(state): number {
      return state.toolSizes[state.tool];
    },
  },
  actions: {
    async open(projectId: string) {
      // Skip the DB round-trip if this project is already loaded (e.g. just created).
      if (this.project?.id === projectId && this.pages.length > 0) return;
      const project = await storage.getProject(projectId);
      if (!project) throw new Error("Project not found");
      this.project = project;
      this.pages = await storage.listPages(projectId);
      if (this.pages.length === 0) {
        const page = await this.createPageInternal(0);
        this.pages = [page];
      }
      this.currentPageId = this.pages[0].id;
      await this.loadStrokes(this.currentPageId);
      await this.loadShapes(this.currentPageId);
      this.history = [];
      this.redoStack = [];
    },
    initNew(project: import("@/core/types").Project, page: import("@/core/types").Page) {
      this.project = project;
      this.pages = [page];
      this.currentPageId = page.id;
      this.strokes = [];
      this.history = [];
      this.redoStack = [];
    },
    async loadStrokes(pageId: string) {
      this.strokes = await storage.listStrokes(pageId);
    },
    async loadShapes(pageId: string) {
      this.shapes = await storage.listShapes(pageId);
    },
    async selectPage(pageId: string) {
      if (this.currentPageId === pageId) return;
      this.currentPageId = pageId;
      await this.loadStrokes(pageId);
      await this.loadShapes(pageId);
      this.history = [];
      this.redoStack = [];
      useLiveStore().broadcast({
        t: "page-set",
        pageId,
        pages: [...this.pages],
        strokes: [...this.strokes],
      });
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
      await this.selectPage(page.id);
      await useProjectsStore().touch(this.project.id);
    },
    async deletePage(pageId: string) {
      if (!this.project) return;
      if (this.pages.length <= 1) return;
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
      if (this.currentPageId === pageId) {
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
    async eraseStroke(strokeId: string) {
      const stroke = this.strokes.find((s) => s.id === strokeId);
      if (!stroke) return;
      this.strokes = this.strokes.filter((s) => s.id !== strokeId);
      this.history = [...this.history, { kind: "stroke-erase", stroke }];
      this.redoStack = [];
      await storage.deleteStroke(strokeId);
      useLiveStore().broadcast({ t: "stroke-delete", pageId: stroke.pageId, strokeId });
    },
    async commitStroke(stroke: Stroke) {
      this.saving++;
      try {
        this.strokes = [...this.strokes, stroke];
        dlog(
          `commit id${stroke.id.slice(-4)} pts${stroke.points.length} total${this.strokes.length}`,
        );
        this.history = [...this.history, { kind: "stroke-add", stroke }];
        this.redoStack = [];
        await storage.putStroke(stroke);
        useLiveStore().broadcast({ t: "stroke-commit", stroke });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async commitText(text: TextItem) {
      const page = this.pages.find((p) => p.id === text.pageId);
      if (!page) return;
      this.saving++;
      try {
        const prev = (page.texts ?? []).find((t) => t.id === text.id) ?? null;
        page.texts = [...(page.texts ?? []).filter((t) => t.id !== text.id), text];
        page.updatedAt = Date.now();
        await storage.putPage({ ...page });
        this.history = [...this.history, { kind: "text-upsert", prev, next: text }];
        this.redoStack = [];
        useLiveStore().broadcast({ t: "text-commit", text });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async commitShape(shape: Shape) {
      this.saving++;
      try {
        this.shapes = [...this.shapes, shape];
        this.history = [...this.history, { kind: "shape-add", shape }];
        this.redoStack = [];
        await storage.putShape(shape);
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
        useLiveStore().broadcast({
          t: "stroke-delete",
          pageId: entry.stroke.pageId,
          strokeId: entry.stroke.id,
        });
      } else if (entry.kind === "stroke-erase") {
        this.strokes = [...this.strokes, entry.stroke];
        await storage.putStroke(entry.stroke);
        useLiveStore().broadcast({ t: "stroke-commit", stroke: entry.stroke });
      } else if (entry.kind === "text-upsert") {
        const page = this.pages.find((p) => p.id === entry.next.pageId);
        if (page) {
          if (entry.prev) {
            page.texts = [...(page.texts ?? []).filter((t) => t.id !== entry.next.id), entry.prev];
            await storage.putPage({ ...page });
            useLiveStore().broadcast({ t: "text-commit", text: entry.prev });
          } else {
            page.texts = (page.texts ?? []).filter((t) => t.id !== entry.next.id);
            await storage.putPage({ ...page });
            useLiveStore().broadcast({ t: "text-delete", pageId: page.id, textId: entry.next.id });
          }
        }
      } else if (entry.kind === "text-delete") {
        const page = this.pages.find((p) => p.id === entry.text.pageId);
        if (page) {
          page.texts = [...(page.texts ?? []).filter((t) => t.id !== entry.text.id), entry.text];
          await storage.putPage({ ...page });
          useLiveStore().broadcast({ t: "text-commit", text: entry.text });
        }
      } else if (entry.kind === "area-erase") {
        this.strokes = [...this.strokes.filter((s) => s.pageId !== entry.pageId), ...entry.before];
        await storage.deleteStrokesForPage(entry.pageId);
        for (const s of entry.before) await storage.putStroke(s);
        useLiveStore().broadcast({
          t: "page-set",
          pageId: entry.pageId,
          pages: [...this.pages],
          strokes: entry.before,
        });
      } else if (entry.kind === "shape-add") {
        this.shapes = this.shapes.filter((s) => s.id !== entry.shape.id);
        await storage.deleteShape(entry.shape.id);
        useLiveStore().broadcast({
          t: "shape-delete",
          pageId: entry.shape.pageId,
          shapeId: entry.shape.id,
        });
      } else if (entry.kind === "shape-erase") {
        this.shapes = [...this.shapes, entry.shape];
        await storage.putShape(entry.shape);
        useLiveStore().broadcast({ t: "shape-commit", shape: entry.shape });
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
        useLiveStore().broadcast({ t: "stroke-commit", stroke: entry.stroke });
      } else if (entry.kind === "stroke-erase") {
        this.strokes = this.strokes.filter((s) => s.id !== entry.stroke.id);
        await storage.deleteStroke(entry.stroke.id);
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
          useLiveStore().broadcast({ t: "text-commit", text: entry.next });
        }
      } else if (entry.kind === "text-delete") {
        const page = this.pages.find((p) => p.id === entry.text.pageId);
        if (page) {
          page.texts = (page.texts ?? []).filter((t) => t.id !== entry.text.id);
          await storage.putPage({ ...page });
          useLiveStore().broadcast({ t: "text-delete", pageId: page.id, textId: entry.text.id });
        }
      } else if (entry.kind === "area-erase") {
        this.strokes = [...this.strokes.filter((s) => s.pageId !== entry.pageId), ...entry.after];
        await storage.deleteStrokesForPage(entry.pageId);
        for (const s of entry.after) await storage.putStroke(s);
        useLiveStore().broadcast({
          t: "page-set",
          pageId: entry.pageId,
          pages: [...this.pages],
          strokes: entry.after,
        });
      } else if (entry.kind === "shape-add") {
        this.shapes = [...this.shapes, entry.shape];
        await storage.putShape(entry.shape);
        useLiveStore().broadcast({ t: "shape-commit", shape: entry.shape });
      } else if (entry.kind === "shape-erase") {
        this.shapes = this.shapes.filter((s) => s.id !== entry.shape.id);
        await storage.deleteShape(entry.shape.id);
        useLiveStore().broadcast({
          t: "shape-delete",
          pageId: entry.shape.pageId,
          shapeId: entry.shape.id,
        });
      }
    },
    async clearPage() {
      if (!this.currentPageId) return;
      await storage.deleteStrokesForPage(this.currentPageId);
      await storage.deleteShapesForPage(this.currentPageId);
      const pageId = this.currentPageId;
      this.strokes = [];
      this.shapes = [];
      this.history = [];
      this.redoStack = [];
      useLiveStore().broadcast({ t: "clear-page", pageId });
    },
    setTool(t: Tool) {
      this.tool = t;
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
    // Area eraser: drop points within `radius` of (wx, wy) and split each
    // affected stroke into the surviving runs of points. In-memory only and
    // synchronous (called rapidly during a drag); persist once via flushPage.
    eraseArea(pageId: string, wx: number, wy: number, radius: number): boolean {
      const r2 = radius * radius;
      const square = this.eraserShape === "square";
      const survivors: Stroke[] = [];
      let changed = false;
      for (const stroke of this.strokes) {
        if (stroke.pageId !== pageId) {
          survivors.push(stroke);
          continue;
        }
        const runs: Stroke["points"][] = [];
        let run: Stroke["points"] = [];
        let hit = false;
        for (const p of stroke.points) {
          const dx = p.x - wx;
          const dy = p.y - wy;
          const inside = square
            ? Math.abs(dx) <= radius && Math.abs(dy) <= radius
            : dx * dx + dy * dy <= r2;
          if (inside) {
            hit = true;
            if (run.length) {
              runs.push(run);
              run = [];
            }
          } else {
            run.push(p);
          }
        }
        if (run.length) runs.push(run);
        if (!hit) {
          survivors.push(stroke);
          continue;
        }
        changed = true;
        runs
          .filter((pts) => pts.length >= 2)
          .forEach((pts, i) => {
            survivors.push({ ...stroke, id: i === 0 ? stroke.id : newId(), points: pts });
          });
      }
      if (changed) this.strokes = survivors;
      return changed;
    },
    // Call before starting an area-erase gesture to snapshot the before-state.
    beginAreaErase(pageId: string) {
      this._areaEraseBefore = this.strokes.filter((s) => s.pageId === pageId);
    },
    // Persist the current strokes of a page after an area-erase gesture.
    async flushPage(pageId: string) {
      this.saving++;
      try {
        const after = this.strokes.filter((s) => s.pageId === pageId);
        const before = this._areaEraseBefore ?? after;
        this._areaEraseBefore = null;
        if (before !== after) {
          this.history = [...this.history, { kind: "area-erase", pageId, before, after }];
          this.redoStack = [];
        }
        await storage.deleteStrokesForPage(pageId);
        for (const s of this.strokes) if (s.pageId === pageId) await storage.putStroke(s);
        useLiveStore().broadcast({
          t: "page-set",
          pageId,
          pages: [...this.pages],
          strokes: after,
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
  },
});
