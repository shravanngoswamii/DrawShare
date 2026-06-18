import { storage } from "@/adapters/storage/indexedDB";
import type { ImageItem, Page, Project, Shape, Stroke } from "@/core/types";

// v2 adds shapes + images per page. Older (v1, strokes-only) backups still import
// — the missing arrays just default to empty.
export const FORMAT_VERSION = 2;

export interface BackupEntry {
  project: Project;
  pages: Array<{ page: Page; strokes: Stroke[]; shapes?: Shape[]; images?: ImageItem[] }>;
}

export interface BackupFile {
  version: number;
  exportedAt: number;
  projects: BackupEntry[];
}

// Serialize a single project (used by file export *and* cloud sync, so both
// speak the exact same format and a cloud file is just a one-project backup).
export async function buildBackupEntry(project: Project): Promise<BackupEntry> {
  const pages = await storage.listPages(project.id);
  const pagesWithContent = await Promise.all(
    pages.map(async (page) => ({
      page,
      strokes: await storage.listStrokes(page.id),
      shapes: await storage.listShapes(page.id),
      images: await storage.listImages(page.id),
    })),
  );
  return { project, pages: pagesWithContent };
}

export function backupFileOf(entries: BackupEntry[]): BackupFile {
  return { version: FORMAT_VERSION, exportedAt: Date.now(), projects: entries };
}

export function parseBackupFile(text: string): BackupFile {
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error("Invalid backup file: not valid JSON");
  }
  if (typeof data.version !== "number" || !Array.isArray(data.projects)) {
    throw new Error("Invalid backup file: missing version or projects");
  }
  return data;
}

// Write the backup's projects into storage. Returns how many were applied.
export async function applyBackup(data: BackupFile): Promise<number> {
  let count = 0;
  for (const entry of data.projects) {
    await storage.putProject(entry.project);
    for (const { page, strokes, shapes, images } of entry.pages) {
      await storage.putPage(page);
      for (const stroke of strokes) await storage.putStroke(stroke);
      for (const shape of shapes ?? []) await storage.putShape(shape);
      for (const image of images ?? []) await storage.putImage(image);
    }
    count++;
  }
  return count;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useProjectBackup() {
  async function exportAll(): Promise<void> {
    const projects = await storage.listProjects();
    const entries = await Promise.all(projects.map(buildBackupEntry));
    const blob = new Blob([JSON.stringify(backupFileOf(entries), null, 2)], {
      type: "application/json",
    });
    triggerDownload(blob, `drawshare-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function exportProject(id: string): Promise<void> {
    const project = await storage.getProject(id);
    if (!project) throw new Error("Project not found");
    const entry = await buildBackupEntry(project);
    const blob = new Blob([JSON.stringify(backupFileOf([entry]), null, 2)], {
      type: "application/json",
    });
    const safeName = project.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
    triggerDownload(blob, `${safeName}-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importAll(file: File): Promise<number> {
    return applyBackup(parseBackupFile(await file.text()));
  }

  return { exportAll, exportProject, importAll };
}
