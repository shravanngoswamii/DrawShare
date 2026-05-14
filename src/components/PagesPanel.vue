<script setup lang="ts">
import { ref } from "vue";
import { useEditorStore } from "@/stores/editor";

defineProps<{ open?: boolean }>();
const emit = defineEmits<{ close: [] }>();

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

async function select(id: string) {
  await editor.selectPage(id);
  emit("close");
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
  <div class="wrap" :class="{ 'is-open': open }">
    <div class="backdrop" @click="emit('close')"></div>
    <aside class="panel" aria-label="Pages and background">
      <div class="panel-head">
        <div class="panel-title">Pages</div>
        <div class="head-actions">
          <button class="btn btn-sm" @click="editor.addPage()" title="Add page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add
          </button>
          <button
            class="btn btn-ghost btn-icon close-btn"
            @click="emit('close')"
            aria-label="Close pages panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="section pages-section">
        <ul class="pages">
          <li
            v-for="page in editor.pages"
            :key="page.id"
            class="page"
            :class="{ active: editor.currentPageId === page.id }"
          >
            <button class="page-main" @click="select(page.id)">
              <div class="page-thumb"></div>
              <div class="page-meta">
                <input
                  v-if="renamingId === page.id"
                  v-model="renameValue"
                  class="input page-rename"
                  @blur="commitRename"
                  @keydown.enter="commitRename"
                  @keydown.esc="renamingId = null"
                  @click.stop
                />
                <span v-else class="page-name">{{ page.name }}</span>
                <span class="muted page-idx">Page {{ page.index + 1 }}</span>
              </div>
            </button>
            <div class="page-actions">
              <button
                class="page-action"
                @click="startRename(page.id, page.name)"
                title="Rename"
              >
                Rename
              </button>
              <button
                v-if="editor.pages.length > 1"
                class="page-action danger"
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
  </div>
</template>

<style scoped>
.wrap {
  display: contents;
}

.backdrop {
  display: none;
}

.panel {
  width: var(--sidepanel-w);
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-surface);
  z-index: 1;
}

.panel-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.close-btn {
  display: none;
}

.section {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.section:last-child {
  border-bottom: none;
}

.section-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}

.pages-section {
  padding: var(--space-2);
}

.pages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
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
  width: 36px;
  height: 48px;
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
  gap: 2px;
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
  height: 26px;
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
}

.page-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-2);
  margin-left: 48px;
}

.page-action {
  font-size: var(--text-xs);
  padding: 4px var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-weight: 500;
}

.page-action:hover {
  background: var(--color-surface-3);
  color: var(--color-text);
}

.page-action.danger {
  color: var(--color-danger);
}

.page-action.danger:hover {
  background: var(--color-danger-soft);
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
  padding: var(--space-3) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}

.bg-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.bg-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

/* Tablet - keep panel inline but narrower */
@media (max-width: 1023px) {
  .panel {
    width: 220px;
  }
}

/* Mobile - drawer */
@media (max-width: 767px) {
  .wrap {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 50;
    pointer-events: none;
  }

  .backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    opacity: 0;
    transition: opacity 180ms ease;
    pointer-events: none;
  }

  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 90vw);
    border-left: 1px solid var(--color-border);
    border-bottom: none;
    box-shadow: var(--shadow-lg);
    transform: translateX(100%);
    transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: auto;
    padding-top: var(--safe-top);
  }

  .wrap.is-open {
    pointer-events: auto;
  }

  .wrap.is-open .backdrop {
    opacity: 1;
    pointer-events: auto;
  }

  .wrap.is-open .panel {
    transform: translateX(0);
  }

  .close-btn {
    display: inline-flex;
  }

  .panel-head {
    padding: var(--space-3) var(--space-4);
  }
}
</style>
