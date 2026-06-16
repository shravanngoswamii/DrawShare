import { type IDBPDatabase, openDB } from "idb";
import type { StorageAdapter } from "@/core/ports";
import type { ID, ImageItem, Page, Project, Shape, Stroke } from "@/core/types";

const DB_NAME = "drawshare";
// v2 added the shapes store; v3 adds the images store. The guarded upgrade below
// is idempotent, so any prior version migrates forward by creating what's missing.
const DB_VERSION = 3;

// Strip Vue reactive Proxies: structured clone (IndexedDB) throws on them.
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface Schema {
  projects: { key: string; value: Project };
  pages: { key: string; value: Page; indexes: { byProject: string } };
  strokes: { key: string; value: Stroke; indexes: { byPage: string } };
  shapes: { key: string; value: Shape; indexes: { byPage: string } };
  images: { key: string; value: ImageItem; indexes: { byPage: string } };
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
        if (!db.objectStoreNames.contains("shapes")) {
          const shapes = db.createObjectStore("shapes", { keyPath: "id" });
          shapes.createIndex("byPage", "pageId");
        }
        if (!db.objectStoreNames.contains("images")) {
          const images = db.createObjectStore("images", { keyPath: "id" });
          images.createIndex("byPage", "pageId");
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
    const tx = db.transaction(["projects", "pages", "strokes", "shapes", "images"], "readwrite");
    const pages = await tx.objectStore("pages").index("byProject").getAllKeys(id);
    for (const pageId of pages) {
      const strokeIds = await tx
        .objectStore("strokes")
        .index("byPage")
        .getAllKeys(pageId as string);
      for (const sid of strokeIds) {
        await tx.objectStore("strokes").delete(sid);
      }
      const shapeIds = await tx
        .objectStore("shapes")
        .index("byPage")
        .getAllKeys(pageId as string);
      for (const sid of shapeIds) {
        await tx.objectStore("shapes").delete(sid);
      }
      const imageIds = await tx
        .objectStore("images")
        .index("byPage")
        .getAllKeys(pageId as string);
      for (const iid of imageIds) {
        await tx.objectStore("images").delete(iid);
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
    await this.deleteShapesForPage(id);
    await this.deleteImagesForPage(id);
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

  listShapes(pageId: ID): Promise<Shape[]> {
    return this.require().getAllFromIndex("shapes", "byPage", pageId);
  }

  async putShape(s: Shape): Promise<void> {
    await this.require().put("shapes", toPlain(s));
  }

  async deleteShape(id: ID): Promise<void> {
    await this.require().delete("shapes", id);
  }

  async deleteShapesForPage(pageId: ID): Promise<void> {
    const db = this.require();
    const tx = db.transaction("shapes", "readwrite");
    const keys = await tx.store.index("byPage").getAllKeys(pageId);
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  }

  listImages(pageId: ID): Promise<ImageItem[]> {
    return this.require().getAllFromIndex("images", "byPage", pageId);
  }

  async putImage(img: ImageItem): Promise<void> {
    await this.require().put("images", toPlain(img));
  }

  async deleteImage(id: ID): Promise<void> {
    await this.require().delete("images", id);
  }

  async deleteImagesForPage(pageId: ID): Promise<void> {
    const db = this.require();
    const tx = db.transaction("images", "readwrite");
    const keys = await tx.store.index("byPage").getAllKeys(pageId);
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  }
}

export const storage = new IndexedDBStorage();
