import { defineStore } from "pinia";
import { storage } from "@/adapters/storage/indexedDB";
import { newId } from "@/core/ids";
import type { Page, Project } from "@/core/types";

const A4_PORTRAIT = { width: 1240, height: 1754 };
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const useProjectsStore = defineStore("projects", {
  state: () => ({
    projects: [] as Project[],
    loaded: false,
  }),
  getters: {
    activeProjects(state): Project[] {
      return state.projects.filter((p) => !p.deletedAt);
    },
    trashedProjects(state): Project[] {
      return state.projects.filter((p) => !!p.deletedAt);
    },
  },
  actions: {
    async load() {
      const all = await storage.listProjects();
      const now = Date.now();
      const expired = all.filter((p) => p.deletedAt && now - p.deletedAt > TRASH_RETENTION_MS);
      for (const p of expired) {
        await storage.deleteProject(p.id);
      }
      this.projects = all.filter((p) => !(p.deletedAt && now - p.deletedAt > TRASH_RETENTION_MS));
      this.loaded = true;
    },
    create(name: string): { project: Project; page: Page } {
      const now = Date.now();
      const pageId = newId();
      const project: Project = {
        id: newId(),
        name: name.trim() || "Untitled",
        createdAt: now,
        updatedAt: now,
        pageOrder: [pageId],
        notebookMode: "off",
      };
      const page: Page = {
        id: pageId,
        projectId: project.id,
        index: 0,
        name: "Page 1",
        width: A4_PORTRAIT.width,
        height: A4_PORTRAIT.height,
        background: "blank",
        originX: 0,
        originY: 0,
        createdAt: now,
        updatedAt: now,
      };
      // Update in-memory state immediately so the editor can open without re-reading DB.
      this.projects = [project, ...this.projects];
      // Persist in the background (not awaited): the caller navigates straight
      // into the editor, which renders from these in-memory objects via
      // editor.initNew. Awaiting the IndexedDB writes here is what made a new
      // project flash in the projects grid before opening — existing projects
      // skip this and open instantly, so we match that.
      void Promise.all([storage.putProject(project), storage.putPage(page)]).catch(() => {});
      return { project, page };
    },
    async rename(id: string, name: string) {
      const p = this.projects.find((x) => x.id === id);
      if (!p) return;
      p.name = name.trim() || p.name;
      p.updatedAt = Date.now();
      await storage.putProject({ ...p });
    },
    async remove(id: string) {
      const p = this.projects.find((x) => x.id === id);
      if (!p) return;
      p.deletedAt = Date.now();
      await storage.putProject({ ...p });
    },
    async restore(id: string) {
      const p = this.projects.find((x) => x.id === id);
      if (!p) return;
      delete p.deletedAt;
      p.updatedAt = Date.now();
      await storage.putProject({ ...p });
    },
    async permanentDelete(id: string) {
      await storage.deleteProject(id);
      this.projects = this.projects.filter((p) => p.id !== id);
    },
    async touch(id: string) {
      const p = this.projects.find((x) => x.id === id);
      if (!p) return;
      p.updatedAt = Date.now();
      await storage.putProject({ ...p });
      this.projects = [...this.projects].sort((a, b) => b.updatedAt - a.updatedAt);
    },
  },
});

export const DEFAULT_PAGE_SIZE = A4_PORTRAIT;
