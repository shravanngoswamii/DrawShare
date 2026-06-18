import { computed, effectScope, ref, watch } from "vue";
import { googleDrive } from "@/adapters/cloud/googleDrive";
import { storage } from "@/adapters/storage/indexedDB";
import { hashString, reconcile, type SyncEntry, type SyncState } from "@/core/cloudSync";
import { newId } from "@/core/ids";
import type { Project } from "@/core/types";
import { useProjectsStore } from "@/stores/projects";
import {
  applyBackup,
  type BackupEntry,
  backupFileOf,
  buildBackupEntry,
  parseBackupFile,
} from "./useProjectBackup";

// Orchestrates backup/sync against a cloud provider (Google Drive). The hard
// decisions live in core/cloudSync (pure, tested); this wires them to storage,
// the provider, and reactive UI state, and decides when to run.

const provider = googleDrive;
const STATE_KEY = "drawshare-sync-base";
const LAST_KEY = "drawshare-sync-last";

const connected = ref(provider.isConnected());
const syncing = ref(false);
// Connected before, but the cached token has expired — needs an interactive
// reconnect. Background sync sets this instead of popping up a login.
const needsAuth = ref(false);
const errorMsg = ref<string | null>(null);
const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const lastSyncedAt = ref<number | null>(readLast());

function readLast(): number | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
function loadState(): SyncState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") as SyncState;
  } catch {
    return {};
  }
}
function saveState(s: SyncState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {}
}

async function serialize(project: Project): Promise<{ content: string; hash: string }> {
  const entry = await buildBackupEntry(project);
  // Hash the entry only (no timestamps) so it's stable across round-trips.
  const hash = hashString(JSON.stringify(entry));
  const content = JSON.stringify(backupFileOf([entry]));
  return { content, hash };
}

// A conflicted remote copy is imported under fresh ids so it never clobbers the
// local project; the user ends up with both and reconciles by hand.
function remapEntry(entry: BackupEntry): BackupEntry {
  const project: Project = {
    ...entry.project,
    id: newId(),
    name: `${entry.project.name} (conflicted copy)`,
    updatedAt: entry.project.updatedAt,
  };
  const pageIdByOld = new Map<string, string>();
  const pages = entry.pages.map(({ page, strokes, shapes, images }) => {
    const pageId = newId();
    pageIdByOld.set(page.id, pageId);
    return {
      page: { ...page, id: pageId, projectId: project.id },
      strokes: strokes.map((s) => ({ ...s, id: newId(), pageId })),
      shapes: (shapes ?? []).map((s) => ({ ...s, id: newId(), pageId })),
      images: (images ?? []).map((i) => ({ ...i, id: newId(), pageId })),
    };
  });
  project.pageOrder = entry.project.pageOrder.map((id) => pageIdByOld.get(id) ?? id);
  return { project, pages };
}

export async function syncNow(interactive = false): Promise<void> {
  if (!provider.isConfigured() || !connected.value || syncing.value || !online.value) return;
  // No valid token: a background run must never pop up Google's login — flag for
  // reconnect and bail. An interactive run (Connect / Sync now) may prompt.
  if (!provider.hasToken()) {
    if (!interactive) {
      needsAuth.value = true;
      return;
    }
    const ok = await provider.authorize();
    if (!ok) {
      errorMsg.value = "Authorization failed";
      return;
    }
  }
  needsAuth.value = false;
  syncing.value = true;
  errorMsg.value = null;
  const state = loadState();
  const contentCache = new Map<string, { content: string; hash: string }>();
  let touchedLocal = false;

  try {
    const projects = await storage.listProjects();
    const projectById = new Map(projects.map((p) => [p.id, p]));

    // Local manifest — reuse the recorded hash for projects unchanged since the
    // last sync, otherwise serialize now (and cache the content for upload).
    const local: SyncEntry[] = [];
    for (const p of projects) {
      const base = state[p.id];
      if (base && base.updatedAt === p.updatedAt) {
        local.push({ id: p.id, updatedAt: p.updatedAt, hash: base.hash });
      } else {
        const s = await serialize(p);
        contentCache.set(p.id, s);
        local.push({ id: p.id, updatedAt: p.updatedAt, hash: s.hash });
      }
    }

    const remoteList = await provider.list();
    const remoteByProject = new Map(remoteList.map((r) => [r.projectId, r]));
    const remote: SyncEntry[] = remoteList.map((r) => ({
      id: r.projectId,
      updatedAt: r.updatedAt,
      hash: r.hash,
    }));

    const getContent = async (p: Project) => {
      const cached = contentCache.get(p.id);
      if (cached) return cached;
      const s = await serialize(p);
      contentCache.set(p.id, s);
      return s;
    };

    for (const action of reconcile(local, remote, state)) {
      const id = action.id;
      const localProject = projectById.get(id);
      const remoteRef = remoteByProject.get(id);

      if (action.type === "push" && localProject) {
        const { content, hash } = await getContent(localProject);
        await provider.upload({
          projectId: id,
          updatedAt: localProject.updatedAt,
          hash,
          content,
          fileId: remoteRef?.fileId,
        });
        state[id] = { updatedAt: localProject.updatedAt, hash };
      } else if (action.type === "pull" && remoteRef) {
        const data = parseBackupFile(await provider.download(remoteRef.fileId));
        await applyBackup(data);
        state[id] = { updatedAt: remoteRef.updatedAt, hash: remoteRef.hash };
        touchedLocal = true;
      } else if (action.type === "conflict" && localProject && remoteRef) {
        // Keep both: import the remote copy under fresh ids, then push local.
        const data = parseBackupFile(await provider.download(remoteRef.fileId));
        if (data.projects[0])
          await applyBackup({ ...data, projects: [remapEntry(data.projects[0])] });
        const { content, hash } = await getContent(localProject);
        await provider.upload({
          projectId: id,
          updatedAt: localProject.updatedAt,
          hash,
          content,
          fileId: remoteRef.fileId,
        });
        state[id] = { updatedAt: localProject.updatedAt, hash };
        touchedLocal = true;
      } else if (action.type === "rebase") {
        const ref = remoteRef ?? null;
        const p = localProject;
        if (p && ref) state[id] = { updatedAt: p.updatedAt, hash: ref.hash };
      }
    }

    saveState(state);
    lastSyncedAt.value = Date.now();
    try {
      localStorage.setItem(LAST_KEY, String(lastSyncedAt.value));
    } catch {}
    if (touchedLocal) await useProjectsStore().load();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    syncing.value = false;
  }
}

// Background triggers: tab focus, reconnect, and a slow interval. Set up once.
let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => {
    online.value = true;
    void syncNow();
  });
  window.addEventListener("offline", () => {
    online.value = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  window.setInterval(() => void syncNow(), 30_000);

  // Sync a few seconds after any local edit settles. editor saves call
  // projects.touch(), which bumps updatedAt — watch that signature. A detached
  // scope keeps it alive regardless of which component first mounted us.
  effectScope(true).run(() => {
    const projects = useProjectsStore();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    watch(
      () => projects.projects.map((p) => `${p.id}:${p.updatedAt}`).join("|"),
      () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void syncNow(), 4000);
      },
    );
  });
}

export function useCloudSync() {
  start();

  const status = computed<
    "unavailable" | "disconnected" | "reauth" | "offline" | "syncing" | "error" | "synced"
  >(() => {
    if (!provider.isConfigured()) return "unavailable";
    if (!connected.value) return "disconnected";
    if (needsAuth.value) return "reauth";
    if (!online.value) return "offline";
    if (syncing.value) return "syncing";
    if (errorMsg.value) return "error";
    return "synced";
  });

  async function connect() {
    const ok = await provider.authorize();
    if (!ok) {
      errorMsg.value = "Authorization failed";
      return;
    }
    connected.value = true;
    needsAuth.value = false;
    await syncNow(true);
  }

  function disconnect() {
    provider.disconnect();
    connected.value = false;
    needsAuth.value = false;
    errorMsg.value = null;
  }

  // Kick off an initial sync if we're already connected from a previous visit
  // (silent — uses the cached token, never pops up a login).
  if (connected.value && online.value) void syncNow();

  return {
    providerLabel: provider.label,
    available: provider.isConfigured(),
    connected,
    syncing,
    needsAuth,
    errorMsg,
    lastSyncedAt,
    status,
    connect,
    disconnect,
    syncNow,
  };
}
