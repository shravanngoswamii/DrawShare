<script setup lang="ts">
import { ref } from "vue";
import { useEditorStore } from "@/stores/editor";

const editor = useEditorStore();
const renamingId = ref<string | null>(null);
const renameValue = ref("");

function startRename(id: string, current: string) {
  renamingId.value = id;
  renameValue.value = current;
}

async function commitRename() {
  if (renamingId.value) {
    await editor.renamePage(renamingId.value, renameValue.value);
  }
  renamingId.value = null;
}

async function remove(id: string, name: string) {
  if (editor.pages.length <= 1) return;
  if (!confirm(`Delete "${name}"?`)) return;
  await editor.deletePage(id);
}

const backgrounds = [
  { id: "blank", label: "Blank" },
  { id: "ruled", label: "Ruled" },
  { id: "grid", label: "Grid" },
  { id: "dotted", label: "Dotted" },
] as const;

async function setBackground(value: "blank" | "ruled" | "grid" | "dotted") {
  const page = editor.currentPage;
  if (!page) return;
  await editor.setPageBackground(page.id, value);
}
</script>

<template>
  <aside class="panel">
    <div class="section">
      <div class="section-head">
        <div class="section-title">Pages</div>
        <button class="btn btn-ghost btn-sm" @click="editor.addPage()" title="Add page">
          Add
        </button>
      </div>
      <ul class="pages">
        <li
          v-for="page in editor.pages"
          :key="page.id"
          class="page"
          :class="{ active: editor.currentPageId === page.id }"
        >
          <button class="page-main" @click="editor.selectPage(page.id)">
            <div class="page-thumb"></div>
            <div class="page-meta">
              <input
                v-if="renamingId === page.id"
                v-model="renameValue"
                class="input page-rename"
                @blur="commitRename"
                @keydown.enter="commitRename"
                @keydown.esc="renamingId = null"
              />
              <span v-else class="page-name">{{ page.name }}</span>
              <span class="muted page-idx">{{ page.index + 1 }}</span>
            </div>
          </button>
          <div class="page-actions">
            <button
              class="btn-ghost mini"
              @click="startRename(page.id, page.name)"
              title="Rename"
            >
              Rename
            </button>
            <button
              v-if="editor.pages.length > 1"
              class="btn-ghost mini danger"
              @click="remove(page.id, page.name)"
              title="Delete"
            >
              Delete
            </button>
          </div>
        </li>
      </ul>
    </div>

    <div class="section">
      <div class="section-title">Background</div>
      <div class="bg-grid">
        <button
          v-for="b in backgrounds"
          :key="b.id"
          class="bg-btn"
          :class="{ active: editor.currentPage?.background === b.id }"
          @click="setBackground(b.id)"
        >
          {{ b.label }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  width: var(--sidepanel-w);
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.section {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.section-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.btn-sm {
  height: 24px;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
}

.pages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.page {
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: var(--space-2);
  transition: background 80ms ease, border-color 80ms ease;
}

.page:hover {
  background: var(--color-surface-2);
}

.page.active {
  background: var(--color-accent-soft);
  border-color: var(--color-border-strong);
}

.page-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  text-align: left;
}

.page-thumb {
  width: 40px;
  height: 52px;
  background: #fff;
  border: 1px solid var(--color-border-strong);
  border-radius: 3px;
  flex-shrink: 0;
}

.page-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.page-name {
  font-size: var(--text-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-idx {
  font-size: var(--text-xs);
}

.page-rename {
  height: 22px;
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
}

.page-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-1);
  margin-left: 52px;
}

.mini {
  font-size: var(--text-xs);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
}

.mini:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.danger {
  color: var(--color-danger);
}

.bg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.bg-btn {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
}

.bg-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.bg-btn.active {
  background: var(--color-accent-soft);
  border-color: var(--color-border-strong);
  color: var(--color-accent);
}
</style>
