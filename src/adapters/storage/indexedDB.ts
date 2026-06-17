import { type IDBPDatabase, openDB } from "idb";
import type { StorageAdapter } from "@/core/ports";
import type {
  ID,
  ImageItem,
  Layer,
  Narration,
  Page,
  Project,
  ReplayEvent,
  Shape,
  Stroke,
} from "@/core/types";

const DB_NAME = "drawshare";
// v2 added shapes; v3 added images; v4 added the replay events log; v5 adds layers;
// v6 adds narrations (voice recordings). Guarded upgrade is idempotent.
const DB_VERSION = 6;

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
  layers: { key: string; value: Layer; indexes: { byPage: string } };
  // Append-only recording log; autoincrement seq preserves order, byProject filters.
  events: { key: number; value: ReplayEvent; indexes: { byProject: string } };
  // One voice narration Blob per project, keyed by projectId.
  narrations: { key: string; value: Narration };
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
        if (!db.objectStoreNames.contains("layers")) {
          const layers = db.createObjectStore("layers", { keyPath: "id" });
          layers.createIndex("byPage", "pageId");
        }
        if (!db.objectStoreNames.contains("events")) {
          const events = db.createObjectStore("events", { keyPath: "seq", autoIncrement: true });
          events.createIndex("byProject", "projectId");
        }
        if (!db.objectStoreNames.contains("narrations")) {
          db.createObjectStore("narrations", { keyPath: "projectId" });
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
    const tx = db.transaction(
      ["projects", "pages", "strokes", "shapes", "images", "layers", "events", "narrations"],
      "readwrite",
    );
    const eventKeys = await tx.objectStore("events").index("byProject").getAllKeys(id);
    for (const k of eventKeys) await tx.objectStore("events").delete(k);
    const pages = await tx.objectStore("pages").index("byProject").getAllKeys(id);
    for (const pageId of pages) {
      for (const store of ["strokes", "shapes", "images", "layers"] as const) {
        const keys = await tx
          .objectStore(store)
          .index("byPage")
          .getAllKeys(pageId as string);
        for (const k of keys) await tx.objectStore(store).delete(k);
      }
      await tx.objectStore("pages").delete(pageId);
    }
    await tx.objectStore("narrations").delete(id);
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
    // Atomic: a mid-cascade failure must not leave a page with orphaned children.
    const db = this.require();
    const tx = db.transaction(["pages", "strokes", "shapes", "images", "layers"], "readwrite");
    for (const store of ["strokes", "shapes", "images", "layers"] as const) {
      const keys = await tx.objectStore(store).index("byPage").getAllKeys(id);
      for (const k of keys) await tx.objectStore(store).delete(k);
    }
    await tx.objectStore("pages").delete(id);
    await tx.done;
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

  async appendEvent(e: ReplayEvent): Promise<void> {
    // toPlain (JSON round-trip) drops an undefined seq, so the autoincrement key
    // generator assigns it.
    await this.require().add("events", toPlain(e));
  }

  async listEvents(projectId: ID): Promise<ReplayEvent[]> {
    // getAllFromIndex returns in key (seq) order → chronological.
    return this.require().getAllFromIndex("events", "byProject", projectId);
  }

  async clearEvents(projectId: ID): Promise<void> {
    const db = this.require();
    const tx = db.transaction("events", "readwrite");
    const keys = await tx.store.index("byProject").getAllKeys(projectId);
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  }

  async putNarration(n: Narration): Promise<void> {
    // Store the Blob directly — toPlain() (JSON round-trip) would destroy binary data.
    await this.require().put("narrations", n);
  }

  getNarration(projectId: ID): Promise<Narration | undefined> {
    return this.require().get("narrations", projectId);
  }

  async deleteNarration(projectId: ID): Promise<void> {
    await this.require().delete("narrations", projectId);
  }
}

export const storage = new IndexedDBStorage();
