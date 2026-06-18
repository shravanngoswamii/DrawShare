// Pure sync reconciliation — no Drive, no IndexedDB, no Vue, so it's fully
// unit-testable. Given what we have locally, what's on the remote, and the
// "base" we last agreed on per project, it decides what to push, pull, or treat
// as a conflict. The orchestrator (useCloudSync) feeds it manifests and runs the
// resulting actions; the Drive adapter does the actual transfer.

export interface SyncEntry {
  id: string; // project id
  updatedAt: number;
  hash: string; // content hash of the serialized project
}

// What both sides agreed on at the last successful sync, per project id.
export interface SyncBase {
  updatedAt: number;
  hash: string;
}
export type SyncState = Record<string, SyncBase>;

export type SyncAction =
  | { type: "push"; id: string } // local is newer → upload
  | { type: "pull"; id: string } // remote is newer / new → download + import
  | { type: "conflict"; id: string } // both changed since base → keep both
  | { type: "rebase"; id: string }; // identical content, just record the new base

function index(entries: SyncEntry[]): Map<string, SyncEntry> {
  return new Map(entries.map((e) => [e.id, e]));
}

export function reconcile(local: SyncEntry[], remote: SyncEntry[], state: SyncState): SyncAction[] {
  const localById = index(local);
  const remoteById = index(remote);
  const ids = new Set<string>([...localById.keys(), ...remoteById.keys()]);
  const actions: SyncAction[] = [];

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    const base = state[id];

    if (l && !r) {
      actions.push({ type: "push", id });
      continue;
    }
    if (!l && r) {
      actions.push({ type: "pull", id });
      continue;
    }
    if (!l || !r) continue;

    if (l.hash === r.hash) {
      // Same content on both sides; record the base if we hadn't.
      if (!base || base.hash !== l.hash) actions.push({ type: "rebase", id });
      continue;
    }
    const localChanged = !base || l.hash !== base.hash;
    const remoteChanged = !base || r.hash !== base.hash;
    if (localChanged && remoteChanged) actions.push({ type: "conflict", id });
    else if (localChanged) actions.push({ type: "push", id });
    else actions.push({ type: "pull", id });
  }

  // Stable order for predictable execution + tests.
  return actions.sort((a, b) => a.id.localeCompare(b.id));
}

// djb2 — small, fast, dependency-free. Enough to detect content changes; this is
// change detection, not cryptography.
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
