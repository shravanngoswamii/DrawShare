<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectBackup } from "@/composables/useProjectBackup";
import { useTheme } from "@/composables/useTheme";
import { useEditorStore } from "@/stores/editor";
import { useProjectsStore } from "@/stores/projects";

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const projects = useProjectsStore();
const editor = useEditorStore();
const router = useRouter();
const { isDark, toggleTheme } = useTheme();
const { exportAll, exportProject, importAll } = useProjectBackup();
const importInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);
const query = ref("");
const renamingId = ref<string | null>(null);
const renameValue = ref("");
const joinCode = ref("");
const trashOpen = ref(false);
const deletingIds = ref<string[]>([]);

async function handleImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importing.value = true;
  try {
    const count = await importAll(file);
    await projects.load();
    alert(`Imported ${count} project${count !== 1 ? "s" : ""} successfully.`);
  } catch (err) {
    alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    importing.value = false;
    if (importInput.value) importInput.value.value = "";
  }
}

function joinSession() {
  const code = joinCode.value.trim().toUpperCase();
  if (code.length < 4) return;
  router.push({ name: "viewer", params: { code } });
}

onMounted(async () => {
  if (!projects.loaded) await projects.load();
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return projects.activeProjects;
  return projects.activeProjects.filter((p) => p.name.toLowerCase().includes(q));
});

function createNew() {
  const { project, page } = projects.create("Untitled");
  editor.initNew(project, page);
  router.push({ name: "editor", params: { id: project.id } });
}

function open(id: string) {
  router.push({ name: "editor", params: { id } });
}

function startRename(id: string, current: string) {
  renamingId.value = id;
  renameValue.value = current;
}

async function commitRename() {
  if (renamingId.value) {
    await projects.rename(renamingId.value, renameValue.value);
  }
  renamingId.value = null;
}

async function remove(id: string) {
  if (!deletingIds.value.includes(id)) {
    deletingIds.value = [...deletingIds.value, id];
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 720));
  await projects.remove(id);
  deletingIds.value = deletingIds.value.filter((x) => x !== id);
}

async function restore(id: string) {
  await projects.restore(id);
}

async function permanentDelete(id: string, name: string) {
  if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
  await projects.permanentDelete(id);
}

function daysRemaining(deletedAt: number): number {
  const msRemaining = TRASH_RETENTION_MS - (Date.now() - deletedAt);
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="page">
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <svg class="brand-mark" width="28" height="28" viewBox="0 0 1024 1024" aria-hidden="true">
            <path d="M916.668 273.393l-66.711 66.711-168.533-168.532 66.712-66.712c52.639-52.639 132.855-57.328 179.24-10.942 23.311 23.309 33.783 55.149 31.698 87.511-1.802 32.647-16.207 65.765-42.406 91.964z" fill="#FF3B30"/>
            <path d="M762.348 163.22c-2.195 0-4.427-0.49-6.534-1.518-7.41-3.613-10.494-12.555-6.877-19.972 21.34-43.746 70.902-63.624 110.446-44.341 7.41 3.618 10.494 12.558 6.876 19.973-3.623 7.408-12.551 10.484-19.976 6.879-24.737-12.065-56.382 1.652-70.494 30.588-2.589 5.305-7.906 8.391-13.441 8.391z" fill="#FFFFFF"/>
            <path d="M143.188 708.155L697.96 155.654l168.981 168.981L304.964 883.58M161.098 920.034l-97.765 38.158 34.206-101.717z" fill="#152B3C"/>
            <path d="M240.709 708.755l-62.541 0.002-34.98-0.602-45.649 148.32 63.556 63.558 143.869-36.453 4.897-45.216 0.025-60.384-70.581 9.731z" fill="#FCB814"/>
            <path d="M861.579 62.897c7.356 4.411 14.285 9.667 20.559 15.942 23.308 23.308 33.781 55.149 31.695 87.509-1.8 32.649-16.206 65.764-42.405 91.965l-36.552 36.552 30.159 30.159 51.631-51.631c26.2-26.201 40.605-59.316 42.407-91.965 2.087-32.359-8.388-64.201-31.696-87.509-18.021-18.023-41.167-28.236-65.798-31.022z"/>
            <path d="M686.755 164.588l91.469 117.335c16.291 20.899 14.49 50.655-4.205 69.435L309.977 817.552l-5.013 66.028 561.977-558.945L697.96 155.654l-11.205 8.934z"/>
            <path d="M269.107 864.233l-129.423 34.388 21.411 21.412 143.869-36.453 4.897-45.216 0.025-60.384-15.239 2.101z"/>
            <path d="M317.969 621.444a14.888 14.888 0 0 1-10.561-4.375c-5.834-5.831-5.834-15.29 0-21.121L641.67 261.687c5.836-5.834 15.287-5.834 21.121 0 5.834 5.831 5.834 15.29 0 21.121L328.529 617.07a14.887 14.887 0 0 1-10.56 4.374z" fill="#FFFFFF"/>
          </svg>
          <div class="brand-name">DrawShare</div>
        </div>
        <div class="header-actions">
          <input
            v-model="query"
            class="input search"
            type="search"
            placeholder="Search projects"
          />
          <!-- Export all projects -->
          <button class="btn btn-ghost btn-icon" title="Export all projects" aria-label="Export all projects" @click="exportAll">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <!-- Import projects -->
          <button class="btn btn-ghost btn-icon" title="Import projects from backup" aria-label="Import projects from backup" @click="importInput?.click()" :disabled="importing">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 5 17 10" />
              <line x1="12" y1="5" x2="12" y2="17" />
            </svg>
          </button>
          <input ref="importInput" type="file" accept=".json" class="sr-only" @change="handleImport" aria-hidden="true" />
          <button class="btn btn-ghost btn-icon theme-btn" @click="toggleTheme" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
            <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </button>
          <button class="btn btn-primary new-btn" @click="createNew">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span class="new-label">New project</span>
          </button>
        </div>
      </div>
    </header>

    <main class="main">
      <section class="join-card">
        <div class="join-text">
          <div class="join-title">Join a live session</div>
          <div class="muted join-sub">
            Enter a code shared by the host device to watch live strokes.
          </div>
        </div>
        <form class="join-form" @submit.prevent="joinSession">
          <input
            v-model="joinCode"
            class="input join-input"
            placeholder="Session code"
            maxlength="8"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="btn join-btn" type="submit" :disabled="joinCode.trim().length < 4">
            Join
          </button>
        </form>
      </section>

      <div class="page-header">
        <h1 class="page-title">Projects</h1>
        <div class="muted page-count" v-if="projects.loaded">
          {{ projects.activeProjects.length }} total
        </div>
      </div>

      <div v-if="!projects.loaded" class="state muted">Loading.</div>

      <div v-else-if="filtered.length === 0 && !query && projects.activeProjects.length === 0" class="empty">
        <div class="empty-icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="m10 12 1 4 4-8" />
          </svg>
        </div>
        <div class="empty-title">No projects yet</div>
        <div class="muted empty-sub">Create your first canvas to start writing.</div>
        <button class="btn btn-primary" @click="createNew">New project</button>
      </div>

      <div v-else-if="filtered.length === 0" class="empty">
        <div class="empty-title">No matches</div>
        <div class="muted empty-sub">No projects match "{{ query }}".</div>
      </div>

      <ul v-else class="grid">
        <li v-for="p in filtered" :key="p.id" class="card" :class="{ 'card-deleting': deletingIds.includes(p.id) }">
          <button class="card-thumb" @click="open(p.id)" aria-label="Open project">
            <div class="thumb-grid"></div>
          </button>
          <div class="card-body">
            <div class="card-title-row">
              <input
                v-if="renamingId === p.id"
                v-model="renameValue"
                class="input rename"
                @blur="commitRename"
                @keydown.enter="commitRename"
                @keydown.esc="renamingId = null"
              />
              <button v-else class="card-title" @click="open(p.id)">
                {{ p.name }}
              </button>
            </div>
            <div class="card-meta muted">Edited {{ formatDate(p.updatedAt) }}</div>
            <div class="card-actions">
              <button class="btn btn-ghost btn-sm" @click="startRename(p.id, p.name)">
                Rename
              </button>
              <button class="btn btn-ghost btn-sm" @click="exportProject(p.id)" title="Export this project as JSON backup">
                Export
              </button>
              <button class="btn btn-ghost btn-sm card-danger" @click="remove(p.id)">
                Delete
              </button>
            </div>
          </div>
        </li>
      </ul>

      <!-- Trash section -->
      <section v-if="projects.loaded && projects.trashedProjects.length > 0" class="trash-section">
        <button class="trash-header" @click="trashOpen = !trashOpen" :aria-expanded="trashOpen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          <span class="trash-title">Trash</span>
          <span class="trash-count muted">{{ projects.trashedProjects.length }}</span>
          <svg class="trash-chevron" :class="{ open: trashOpen }" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <ul v-if="trashOpen" class="trash-list">
          <li v-for="p in projects.trashedProjects" :key="p.id" class="trash-item">
            <div class="trash-item-info">
              <span class="trash-item-name">{{ p.name }}</span>
              <span class="trash-item-meta muted">
                {{ daysRemaining(p.deletedAt!) }} day{{ daysRemaining(p.deletedAt!) === 1 ? '' : 's' }} remaining
              </span>
            </div>
            <div class="trash-item-actions">
              <button class="btn btn-ghost btn-sm" @click="restore(p.id)">Restore</button>
              <button class="btn btn-ghost btn-sm card-danger" @click="permanentDelete(p.id, p.name)">Delete permanently</button>
            </div>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  height: 100dvh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-top: var(--safe-top);
}

.header {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 var(--space-6);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.brand-mark {
  flex-shrink: 0;
}

.brand-name {
  font-weight: 600;
  letter-spacing: -0.015em;
  font-size: var(--text-md);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.theme-btn {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.search {
  width: 260px;
}

.new-btn svg {
  flex-shrink: 0;
}

.main {
  padding: var(--space-8) var(--space-6);
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
}

.join-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-8);
}

.join-text {
  min-width: 0;
}

.join-title {
  font-size: var(--text-sm);
  font-weight: 600;
}

.join-sub {
  font-size: var(--text-xs);
  margin-top: 2px;
}

.join-form {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-shrink: 0;
}

.join-input {
  width: 180px;
  font-family: var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-6);
  gap: var(--space-3);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
}

.page-count {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.state {
  padding: var(--space-8);
}

.empty {
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  padding: var(--space-10) var(--space-6);
  text-align: center;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  color: var(--color-text-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-2);
}

.empty-title {
  font-size: var(--text-lg);
  font-weight: 600;
}

.empty-sub {
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-5);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}

.card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-md);
}

.card-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
}

.thumb-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--color-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--color-border) 1px, transparent 1px);
  background-size: 24px 24px;
}

.card-body {
  padding: var(--space-3) var(--space-4) var(--space-4);
}

.card-title-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-1);
}

.card-title {
  font-size: var(--text-md);
  font-weight: 600;
  text-align: left;
  letter-spacing: -0.01em;
  color: var(--color-text);
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename {
  height: 30px;
}

.card-meta {
  font-size: var(--text-xs);
  margin-bottom: var(--space-3);
}

.card-actions {
  display: flex;
  gap: var(--space-1);
  margin-left: -8px;
}

.card-danger {
  color: var(--color-danger);
}

.card-danger:hover:not(:disabled) {
  background: var(--color-danger-soft);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.trash-section {
  margin-top: var(--space-10);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.trash-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

.trash-header:hover {
  background: var(--color-surface-2);
}

.trash-title {
  flex: 1;
  color: var(--color-text);
  font-weight: 600;
}

.trash-count {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.trash-chevron {
  transition: transform 200ms ease;
  flex-shrink: 0;
}

.trash-chevron.open {
  transform: rotate(180deg);
}

.trash-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--color-border);
}

.trash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.trash-item:last-child {
  border-bottom: none;
}

.trash-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.trash-item-name {
  font-size: var(--text-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-item-meta {
  font-size: var(--text-xs);
}

.trash-item-actions {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

/* Tablet */
@media (max-width: 1023px) {
  .header-inner,
  .main {
    padding-left: var(--space-5);
    padding-right: var(--space-5);
  }

  .search {
    width: 200px;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-4);
  }
}

/* Phone */
@media (max-width: 767px) {
  .header-inner {
    padding: var(--space-2) var(--space-4);
    height: auto;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }

  .brand {
    height: 40px;
  }

  .header-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
  }

  .search {
    width: 100%;
  }

  .new-label {
    display: none;
  }

  .new-btn {
    width: 40px;
    padding: 0;
  }

  .main {
    padding: var(--space-5) var(--space-4) var(--space-10);
  }

  .join-card {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .join-form {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .join-input {
    width: 100%;
  }

  .page-title {
    font-size: var(--text-xl);
  }

  .grid {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .card-body {
    padding: var(--space-3);
  }

  .card-title {
    font-size: var(--text-sm);
  }
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

@keyframes card-crumple {
  0%   { transform: translateY(0)    scale(1,    1)    rotate(0deg);   opacity: 1;    }
  7%   { transform: translateY(-10px) scale(1.06, 1.06) rotate(-1deg);  opacity: 1;    }
  18%  { transform: translateY(-5px)  scaleX(1.09) scaleY(0.84) skewX(-5deg) rotate(2deg);  opacity: 1;    }
  30%  { transform: translateY(-2px)  scaleX(0.93) scaleY(0.75) skewX(4deg)  rotate(-4deg); opacity: 1;    }
  42%  { transform: translateY(3px)   scaleX(1.04) scaleY(0.66) skewX(-3deg) rotate(6deg);  opacity: 0.95; }
  55%  { transform: translateY(14px)  scale(0.62,  0.50) rotate(-8deg);  opacity: 0.82; }
  68%  { transform: translateY(34px)  scale(0.40,  0.30) rotate(11deg);  opacity: 0.55; }
  84%  { transform: translateY(62px)  scale(0.20,  0.14) rotate(-14deg); opacity: 0.25; }
  100% { transform: translateY(92px)  scale(0.08,  0.06) rotate(18deg);  opacity: 0;    }
}

.card-deleting {
  animation: card-crumple 720ms cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards;
  pointer-events: none;
  transform-origin: center bottom;
}
</style>
