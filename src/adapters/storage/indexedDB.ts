import { type IDBPDatabase, openDB } from "idb";
import type { StorageAdapter } from "@/core/ports";
import type { ID, Layer, Page, Project, Stroke } from "@/core/types";

const DB_NAME = "drawshare";
const DB_VERSION = 2;

// Strip Vue reactive Proxies: structured clone (IndexedDB) throws on them.
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface Schema {
  projects: { key: string; value: Project };
  pages: { key: string; value: Page; indexes: { byProject: string } };
  strokes: { key: string; value: Stroke; indexes: { byPage: string } };
  layers: { key: string; value: Layer; indexes: { byPage: string } };
}

export class IndexedDBStorage implements StorageAdapter {
  private db: IDBPDatabase<Schema> | undefined;

  async init(): Promise<void> {
    this.db = await openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("projects")) {
          db.createObjectStore("projects", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pages")) {
          const pages = db.createObjectStore("pages", { keyPath: "id" });
          pages.createIndex("byProject", "projectId");
        }
        if (!db.objectStoreNames.contains("strokes")) {
          const strokes = db.createObjectStore("strokes", { keyPath: "id" });
          strokes.createIndex("byPage", "pageId");
        }
        if (!db.objectStoreNames.contains("layers")) {
          const layers = db.createObjectStore("layers", { keyPath: "id" });
          layers.createIndex("byPage", "pageId");
        }
      },
    });
  }

  private require(): IDBPDatabase<Schema> {
    if (!this.db) throw new Error("Storage not initialised");
    return this.db;
  }

  async listProjects(): Promise<Project[]> {
    const all = await this.require().getAll("projects");
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getProject(id: ID): Promise<Project | undefined> {
    return this.require().get("projects", id);
  }

  async putProject(p: Project): Promise<void> {
    await this.require().put("projects", toPlain(p));
  }

  async deleteProject(id: ID): Promise<void> {
    const db = this.require();
    const tx = db.transaction(["projects", "pages", "strokes", "layers"], "readwrite");
    const pages = await tx.objectStore("pages").index("byProject").getAllKeys(id);
    for (const pageId of pages) {
      const strokeIds = await tx
        .objectStore("strokes")
        .index("byPage")
        .getAllKeys(pageId as string);
      for (const sid of strokeIds) {
        await tx.objectStore("strokes").delete(sid);
      }
      const layerIds = await tx
        .objectStore("layers")
        .index("byPage")
        .getAllKeys(pageId as string);
      for (const lid of layerIds) {
        await tx.objectStore("layers").delete(lid);
      }
      await tx.objectStore("pages").delete(pageId);
    }
    await tx.objectStore("projects").delete(id);
    await tx.done;
  }

  async listPages(projectId: ID): Promise<Page[]> {
    const all = await this.require().getAllFromIndex("pages", "byProject", projectId);
    return all.sort((a, b) => a.index - b.index);
  }

  getPage(id: ID): Promise<Page | undefined> {
    return this.require().get("pages", id);
  }

  async putPage(p: Page): Promise<void> {
    await this.require().put("pages", toPlain(p));
  }

  async deletePage(id: ID): Promise<void> {
    await this.deleteStrokesForPage(id);
    await this.deleteLayersForPage(id);
    await this.require().delete("pages", id);
  }

  listStrokes(pageId: ID): Promise<Stroke[]> {
    return this.require().getAllFromIndex("strokes", "byPage", pageId);
  }

  async putStroke(s: Stroke): Promise<void> {
    await this.require().put("strokes", toPlain(s));
  }

  async deleteStroke(id: ID): Promise<void> {
    await this.require().delete("strokes", id);
  }

  async deleteStrokesForPage(pageId: ID): Promise<void> {
    const db = this.require();
    const tx = db.transaction("strokes", "readwrite");
    const keys = await tx.store.index("byPage").getAllKeys(pageId);
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  }

  async listLayers(pageId: ID): Promise<Layer[]> {
    const all = await this.require().getAllFromIndex("layers", "byPage", pageId);
    return all.sort((a, b) => a.index - b.index);
  }

  async putLayer(layer: Layer): Promise<void> {
    await this.require().put("layers", toPlain(layer));
  }

  async deleteLayer(id: ID): Promise<void> {
    await this.require().delete("layers", id);
  }

  async deleteLayersForPage(pageId: ID): Promise<void> {
    const db = this.require();
    const tx = db.transaction("layers", "readwrite");
    const keys = await tx.store.index("byPage").getAllKeys(pageId);
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  }
}

export const storage = new IndexedDBStorage();
