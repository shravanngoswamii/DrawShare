<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectsStore } from "@/stores/projects";

const projects = useProjectsStore();
const router = useRouter();
const query = ref("");
const renamingId = ref<string | null>(null);
const renameValue = ref("");
const joinCode = ref("");

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
  if (!q) return projects.projects;
  return projects.projects.filter((p) => p.name.toLowerCase().includes(q));
});

async function createNew() {
  const project = await projects.create("Untitled");
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

async function remove(id: string, name: string) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  await projects.remove(id);
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
          {{ projects.projects.length }} total
        </div>
      </div>

      <div v-if="!projects.loaded" class="state muted">Loading.</div>

      <div v-else-if="filtered.length === 0 && !query" class="empty">
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
        <li v-for="p in filtered" :key="p.id" class="card">
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
              <button class="btn btn-ghost btn-sm card-danger" @click="remove(p.id, p.name)">
                Delete
              </button>
            </div>
          </div>
        </li>
      </ul>
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
    linear-gradient(to right, rgba(15, 23, 42, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(15, 23, 42, 0.05) 1px, transparent 1px);
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
</style>
