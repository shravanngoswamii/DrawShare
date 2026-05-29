import { defineStore } from "pinia";
import { dlog } from "@/debug";
import { storage } from "@/adapters/storage/indexedDB";
import { newId } from "@/core/ids";
import { DEFAULT_PAGE_SIZE, useProjectsStore } from "./projects";
import { useLiveStore } from "./live";
import type { Page, Project, Stroke, TextItem, Tool } from "@/core/types";

interface EditorState {
  project: Project | undefined;
  pages: Page[];
  currentPageId: string | undefined;
  strokes: Stroke[];
  tool: Tool;
  color: string;
  toolSizes: Record<Tool, number>;
  opacity: number;
  eraserMode: "stroke" | "area";
  saving: number;
  history: Stroke[];
  redoStack: Stroke[];
  camera: { x: number; y: number; zoom: number };
  isDrawing: boolean;
}

export const useEditorStore = defineStore("editor", {
  state: (): EditorState => ({
    project: undefined,
    pages: [],
    currentPageId: undefined,
    strokes: [],
    tool: "pen",
    color: "#0f172a",
    toolSizes: { pen: 4, highlighter: 20, eraser: 24, text: 4 },
    opacity: 1,
    eraserMode: "stroke",
    saving: 0,
    history: [],
    redoStack: [],
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
      this.history = [];
      this.redoStack = [];
    },
    async loadStrokes(pageId: string) {
      this.strokes = await storage.listStrokes(pageId);
    },
    async selectPage(pageId: string) {
      if (this.currentPageId === pageId) return;
      this.currentPageId = pageId;
      await this.loadStrokes(pageId);
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
      this.pages = this.pages
        .filter((p) => p.id !== pageId)
        .map((p, i) => ({ ...p, index: i }));
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
      this.history = this.history.filter((s) => s.id !== strokeId);
      this.redoStack = this.redoStack.filter((s) => s.id !== strokeId);
      await storage.deleteStroke(strokeId);
      useLiveStore().broadcast({ t: "stroke-delete", pageId: stroke.pageId, strokeId });
    },
    async commitStroke(stroke: Stroke) {
      this.saving++;
      try {
        this.strokes = [...this.strokes, stroke];
        dlog(`commit id${stroke.id.slice(-4)} pts${stroke.points.length} total${this.strokes.length}`);
        this.history = [...this.history, stroke];
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
        page.texts = [...(page.texts ?? []).filter((t) => t.id !== text.id), text];
        page.updatedAt = Date.now();
        await storage.putPage({ ...page });
        useLiveStore().broadcast({ t: "text-commit", text });
        if (this.project) await useProjectsStore().touch(this.project.id);
      } finally {
        this.saving--;
      }
    },
    async deleteText(pageId: string, textId: string) {
      const page = this.pages.find((p) => p.id === pageId);
      if (!page?.texts) return;
      page.texts = page.texts.filter((t) => t.id !== textId);
      page.updatedAt = Date.now();
      await storage.putPage({ ...page });
      useLiveStore().broadcast({ t: "text-delete", pageId, textId });
    },
    async undo() {
      const last = this.history[this.history.length - 1];
      if (!last) return;
      this.history = this.history.slice(0, -1);
      this.redoStack = [...this.redoStack, last];
      this.strokes = this.strokes.filter((s) => s.id !== last.id);
      await storage.deleteStroke(last.id);
      useLiveStore().broadcast({
        t: "stroke-delete",
        pageId: last.pageId,
        strokeId: last.id,
      });
    },
    async redo() {
      const next = this.redoStack[this.redoStack.length - 1];
      if (!next) return;
      this.redoStack = this.redoStack.slice(0, -1);
      this.history = [...this.history, next];
      this.strokes = [...this.strokes, next];
      await storage.putStroke(next);
      useLiveStore().broadcast({ t: "stroke-commit", stroke: next });
    },
    async clearPage() {
      if (!this.currentPageId) return;
      await storage.deleteStrokesForPage(this.currentPageId);
      const pageId = this.currentPageId;
      this.strokes = [];
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
    // Area eraser: drop points within `radius` of (wx, wy) and split each
    // affected stroke into the surviving runs of points. In-memory only and
    // synchronous (called rapidly during a drag); persist once via flushPage.
    eraseArea(pageId: string, wx: number, wy: number, radius: number): boolean {
      const r2 = radius * radius;
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
          if (dx * dx + dy * dy <= r2) {
            hit = true;
            if (run.length) { runs.push(run); run = []; }
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
    // Persist the current strokes of a page after an area-erase gesture.
    async flushPage(pageId: string) {
      this.saving++;
      try {
        await storage.deleteStrokesForPage(pageId);
        for (const s of this.strokes) if (s.pageId === pageId) await storage.putStroke(s);
        useLiveStore().broadcast({
          t: "page-set",
          pageId,
          pages: [...this.pages],
          strokes: this.strokes.filter((s) => s.pageId === pageId),
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
