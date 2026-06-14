<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { exportPageAsPng } from "@/composables/useExport";
import { useTheme } from "@/composables/useTheme";
import { useThumbnails } from "@/composables/useThumbnails";
import { devMode, setDevMode } from "@/debug";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ open?: boolean; collapsed?: boolean }>();
const emit = defineEmits<{ close: []; toggle: []; share: [] }>();

const editor = useEditorStore();
const live = useLiveStore();
const projects = useProjectsStore();
const router = useRouter();
const { isDark, toggleTheme } = useTheme();
const { thumbnails, renderThumbnail, loadAndRenderThumbnail } = useThumbnails();

const renamingId = ref<string | null>(null);
const renameValue = ref("");

const projectName = ref("");
watch(
  () => editor.project?.name,
  (n) => {
    projectName.value = n ?? "";
  },
  { immediate: true },
);

const saveStatus = computed(() => (editor.saving > 0 ? "Saving…" : "Saved"));

let thumbDebounce: ReturnType<typeof setTimeout> | undefined;

// Render current page thumbnail whenever strokes or texts change.
// Skips debounce on first render so the thumbnail appears immediately on load.
watch(
  () => [editor.strokes, editor.currentPage?.texts],
  () => {
    const page = editor.currentPage;
    if (!page) return;
    clearTimeout(thumbDebounce);
    if (!thumbnails.value[page.id]) {
      renderThumbnail(page, editor.strokes);
    } else {
      thumbDebounce = setTimeout(() => renderThumbnail(page, editor.strokes), 400);
    }
  },
  { deep: false },
);

// When the project loads or current page changes, lazy-load thumbnails for all
// other pages. Works on desktop (panel always visible) and mobile.
watch(
  () => editor.currentPageId,
  (id) => {
    if (!id) return;
    for (const p of editor.pages) {
      if (thumbnails.value[p.id] || p.id === id) continue;
      loadAndRenderThumbnail(p);
    }
  },
  { immediate: true },
);

async function commitName() {
  if (!editor.project) return;
  const trimmed = projectName.value.trim();
  if (!trimmed) {
    projectName.value = editor.project.name;
    return;
  }
  if (trimmed !== editor.project.name) {
    editor.project.name = trimmed;
    await projects.rename(editor.project.id, trimmed);
  }
}

const isFullscreen = ref(false);
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}
onMounted(() => document.addEventListener("fullscreenchange", onFullscreenChange));
onBeforeUnmount(() => document.removeEventListener("fullscreenchange", onFullscreenChange));

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

async function clearPage() {
  if (!confirm("Clear all strokes on this page?")) return;
  await editor.clearPage();
}

function onNameEnter(e: KeyboardEvent) {
  (e.target as HTMLInputElement).blur();
}

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

async function exportCurrentPage() {
  const page = editor.currentPage;
  if (!page) return;
  await exportPageAsPng(page, editor.strokes);
}

// Layers
const renamingLayerId = ref<string | null>(null);
const renameLayerValue = ref("");

function startRenameLayer(id: string, current: string) {
  renamingLayerId.value = id;
  renameLayerValue.value = current;
}

async function commitRenameLayer() {
  if (renamingLayerId.value) {
    await editor.renameLayer(renamingLayerId.value, renameLayerValue.value);
  }
  renamingLayerId.value = null;
}

async function removeLayer(id: string) {
  if (editor.layers.length <= 1) return;
  await editor.deleteLayer(id);
}
</script>

<template>
  <div class="wrap" :class="{ 'is-open': open }">
    <div class="backdrop" @click="emit('close')"></div>
    <aside class="panel" :class="{ 'is-collapsed': collapsed, quiet: editor.isDrawing }" aria-label="Pages and settings">

      <!-- ── Header ── -->
      <div class="panel-head">
        <button class="head-icon" @click="router.push({ name: 'projects' })" title="Back to projects" aria-label="Back to projects">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
        </button>
        <input
          v-model="projectName"
          class="project-name"
          @blur="commitName"
          @keydown.enter="onNameEnter"
          :placeholder="editor.project?.name ?? 'Untitled'"
        />
        <span class="save-chip" :class="{ saving: editor.saving > 0 }">{{ saveStatus }}</span>
        <button class="head-icon" @click="toggleTheme" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
          <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </button>
        <button class="head-icon desktop-toggle" @click="emit('toggle')" title="Collapse panel" aria-label="Collapse panel">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" fill-rule="evenodd" d="M10 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8zM9 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3zM4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" clip-rule="evenodd"/>
          </svg>
        </button>
        <button class="head-icon close-btn" @click="emit('close')" aria-label="Close panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <!-- ── Share ── -->
      <div class="share-section">
        <button class="share-btn" :class="{ live: live.isHosting }" @click="emit('share')" :title="live.isHosting ? `Live session: ${live.code}` : 'Start a live session'">
          <span v-if="live.isHosting" class="live-dot" aria-hidden="true"></span>
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
          </svg>
          <span class="share-label">{{ live.isHosting ? `Live · ${live.code}` : 'Share live session' }}</span>
        </button>
      </div>

      <!-- ── Pages ── -->
      <div class="section pages-section">
        <div class="section-title pages-head">
          <span>Pages</span>
          <button class="add-page" @click="editor.addPage()" title="Add page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
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
            <button class="page-main" @click="select(page.id)">
              <div class="page-thumb">
                <img
                  v-if="thumbnails[page.id]"
                  :src="thumbnails[page.id]"
                  class="thumb-img"
                  :alt="`Preview of ${page.name}`"
                  aria-hidden="true"
                />
                <span v-else class="thumb-num">{{ page.index + 1 }}</span>
              </div>
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
              </div>
            </button>
            <div class="page-actions">
              <button class="page-action" @click="startRename(page.id, page.name)">Rename</button>
              <button
                v-if="editor.pages.length > 1"
                class="page-action danger"
                @click="remove(page.id, page.name)"
              >Delete</button>
            </div>
          </li>
        </ul>

        <!-- Page-level tools: export, clear, fullscreen, dev -->
        <div class="page-tools">
          <button class="tool-btn" @click="exportCurrentPage" title="Export page as PNG">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export PNG</span>
          </button>
          <button class="tool-btn" @click="clearPage" title="Clear all strokes">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
            <span>Clear page</span>
          </button>
          <button class="tool-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
            <span>{{ isFullscreen ? 'Exit full' : 'Fullscreen' }}</span>
          </button>
          <button class="tool-btn" :class="{ 'tool-active': devMode }" @click="setDevMode(!devMode)" title="Dev mode">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m8 9-3 3 3 3" /><path d="m16 9 3 3-3 3" /><path d="M13.5 7.5 10 17" />
            </svg>
            <span>Dev mode</span>
          </button>
        </div>
      </div>

      <!-- ── Layers ── -->
      <div class="section layers-section">
        <div class="section-head">
          <span class="section-title layers-title">Layers</span>
          <button class="btn-icon" @click="editor.addLayer()" title="Add layer" aria-label="Add layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
          </button>
        </div>
        <div class="layers-list">
          <div
            v-for="layer in [...editor.layers].reverse()"
            :key="layer.id"
            class="layer-row"
            :class="{ active: layer.id === editor.currentLayerId, locked: layer.locked, hidden: !layer.visible }"
            @click="editor.selectLayer(layer.id)"
          >
            <!-- Visibility toggle -->
            <button
              class="layer-icon-btn"
              @click.stop="editor.toggleLayerVisibility(layer.id)"
              :title="layer.visible ? 'Hide layer' : 'Show layer'"
              :aria-label="layer.visible ? 'Hide layer' : 'Show layer'"
            >
              <svg v-if="layer.visible" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
            <!-- Lock toggle -->
            <button
              class="layer-icon-btn"
              @click.stop="editor.toggleLayerLock(layer.id)"
              :title="layer.locked ? 'Unlock layer' : 'Lock layer'"
              :aria-label="layer.locked ? 'Unlock layer' : 'Lock layer'"
            >
              <svg v-if="layer.locked" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            </button>
            <!-- Layer name -->
            <input
              v-if="renamingLayerId === layer.id"
              v-model="renameLayerValue"
              class="input layer-rename"
              @blur="commitRenameLayer"
              @keydown.enter="commitRenameLayer"
              @keydown.esc="renamingLayerId = null"
              @click.stop
            />
            <span
              v-else
              class="layer-name"
              @dblclick.stop="startRenameLayer(layer.id, layer.name)"
            >{{ layer.name }}</span>
            <!-- Reorder buttons -->
            <div class="layer-reorder">
              <button
                class="layer-icon-btn"
                @click.stop="editor.moveLayerUp(layer.id)"
                :disabled="layer.index >= editor.layers.length - 1"
                title="Move layer up"
                aria-label="Move layer up"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <button
                class="layer-icon-btn"
                @click.stop="editor.moveLayerDown(layer.id)"
                :disabled="layer.index <= 0"
                title="Move layer down"
                aria-label="Move layer down"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <!-- Delete button -->
            <button
              v-if="editor.layers.length > 1"
              class="layer-icon-btn layer-delete"
              @click.stop="removeLayer(layer.id)"
              title="Delete layer"
              aria-label="Delete layer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Background ── -->
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

/* ── Floating glass panel — desktop ── */
.panel {
  position: absolute;
  right: 8px;
  top: 8px;
  width: var(--sidepanel-w);
  max-height: calc(100% - 16px);
  z-index: 10;
  background: var(--color-glass-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  transform-origin: top right;
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease;
}

.panel.is-collapsed {
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
}

.panel.quiet {
  opacity: 0.12;
  pointer-events: none;
  transition: opacity 150ms ease;
}

/* ── Header ── */
.panel-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-glass-bg-strong);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 12px 12px 0 0;
  z-index: 1;
}

.head-icon {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: background 80ms ease, color 80ms ease;
}
.head-icon:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.project-name {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: -0.01em;
  padding: 4px var(--space-2);
  border-radius: var(--radius-md);
}
.project-name:hover { background: var(--color-surface-2); }
.project-name:focus {
  outline: none;
  background: var(--color-surface);
  border-color: var(--color-focus);
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}

.save-chip {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.01em;
}
.save-chip.saving { color: var(--color-accent); }

.close-btn { display: none; }

/* ── Share ── */
.share-section {
  padding: var(--space-3) var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.share-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 36px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.share-btn:hover {
  background: var(--color-surface-3, var(--color-surface-2));
  color: var(--color-text);
  border-color: var(--color-border-strong);
}
.share-btn.live {
  background: var(--color-success-soft);
  border-color: var(--color-success);
  color: var(--color-success-strong);
}
.share-label {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.share-btn.live .share-label {
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
  flex-shrink: 0;
}

/* ── Sections ── */
.section {
  padding: var(--space-3) var(--space-3) var(--space-4);
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

/* ── Pages ── */
.pages-section {
  padding: var(--space-2) var(--space-2) var(--space-3);
}

.pages-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-1);
}
.pages-head > span {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.add-page {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-accent);
}
.add-page:hover { background: var(--color-accent-soft); }

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
.page:hover { background: var(--color-surface-2); }
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
  width: 32px;
  height: 45px;
  background: var(--color-canvas-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  overflow: hidden;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 3px;
}

.thumb-num {
  line-height: 1;
}

.page-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.page-name {
  font-size: var(--text-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  margin-left: 44px;
}

.page-action {
  font-size: var(--text-xs);
  padding: 4px var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-weight: 500;
}
.page-action:hover { background: var(--color-surface-3, var(--color-surface-2)); color: var(--color-text); }
.page-action.danger { color: var(--color-danger); }
.page-action.danger:hover { background: var(--color-danger-soft); }

/* ── Page tools grid ── */
.page-tools {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: 0 var(--space-1);
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: var(--space-2) var(--space-1);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-glass-bg);
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 500;
  text-align: center;
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.tool-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
  border-color: var(--color-border-strong);
}
.tool-btn.tool-active {
  background: var(--color-success-soft);
  border-color: var(--color-success);
  color: var(--color-success-strong);
}

/* ── Layers ── */
.layers-section {
  padding: var(--space-3) var(--space-3) var(--space-3);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.layers-title {
  margin-bottom: 0;
}

.btn-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-accent);
  flex-shrink: 0;
  transition: background 80ms ease;
}
.btn-icon:hover { background: var(--color-accent-soft); }

.layers-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px var(--space-2);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 80ms ease, border-color 80ms ease, opacity 80ms ease;
  min-height: 32px;
}
.layer-row:hover { background: var(--color-surface-2); }
.layer-row.active {
  background: var(--color-accent-soft);
  border-color: var(--color-border-strong);
}
.layer-row.hidden { opacity: 0.45; }
.layer-row.locked { opacity: 0.7; }

.layer-icon-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: background 80ms ease, color 80ms ease;
}
.layer-icon-btn:hover:not(:disabled) {
  background: var(--color-surface-3, var(--color-surface-2));
  color: var(--color-text);
}
.layer-icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.layer-delete:hover:not(:disabled) {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

.layer-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.layer-rename {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
}

.layer-reorder {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
}

/* ── Background ── */
.bg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.bg-btn {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  padding: var(--space-3) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.bg-btn:hover { background: var(--color-surface-2); color: var(--color-text); }
.bg-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

/* ── Mobile — slide-in drawer ── */
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
    background: rgba(15, 23, 42, 0.5);
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
    border-radius: 0;
    background: var(--color-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-left: 1px solid var(--color-border);
    box-shadow: var(--shadow-lg);
    transform: translateX(100%) !important;
    transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1) !important;
    opacity: 1 !important;
    pointer-events: auto;
    padding-top: var(--safe-top);
  }

  .wrap.is-open { pointer-events: auto; }
  .wrap.is-open .backdrop { opacity: 1; pointer-events: auto; }
  .wrap.is-open .panel { transform: translateX(0) !important; }

  .desktop-toggle { display: none; }
  .close-btn { display: inline-flex; }

  .panel-head {
    background: var(--color-surface);
    backdrop-filter: none;
    border-radius: 0;
    padding: var(--space-3) var(--space-4);
  }
}
</style>
