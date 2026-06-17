<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  exportNotebookPdf as exportNotebookPdfToPrint,
  exportPageAsPng,
} from "@/composables/useExport";
import { encodeSnapshot } from "@/composables/useSnapshot";
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

// Current page name, edited inline in the detail header (master-detail layout).
const pageName = ref("");
watch(
  () => editor.currentPage?.name,
  (n) => {
    pageName.value = n ?? "";
  },
  { immediate: true },
);

// Progressive disclosure: occasional settings/actions stay collapsed by default
// so the panel opens on just Pages + Layers. Header overflow menu holds the rest.
const showSetup = ref(false);
const showActions = ref(false);
const menuOpen = ref(false);

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
  () => [editor.strokes, editor.shapes, editor.images, editor.currentPage?.texts],
  () => {
    const page = editor.currentPage;
    if (!page) return;
    clearTimeout(thumbDebounce);
    if (!thumbnails.value[page.id]) {
      renderThumbnail(page, editor.strokes, editor.shapes, editor.images);
    } else {
      thumbDebounce = setTimeout(
        () => renderThumbnail(page, editor.strokes, editor.shapes, editor.images),
        400,
      );
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

// Thumbnails bake in the theme (paper + ink), so they go stale on a theme switch.
// Drop the cache and re-render the current page now plus lazy-load the rest.
watch(isDark, () => {
  thumbnails.value = {};
  const cur = editor.currentPage;
  if (cur) renderThumbnail(cur, editor.strokes, editor.shapes, editor.images);
  for (const p of editor.pages) {
    if (cur?.id === p.id) continue;
    loadAndRenderThumbnail(p);
  }
});

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

async function commitPageName() {
  const page = editor.currentPage;
  if (!page) return;
  const trimmed = pageName.value.trim();
  if (!trimmed) {
    pageName.value = page.name;
    return;
  }
  if (trimmed !== page.name) await editor.renamePage(page.id, trimmed);
}

async function remove(id: string, name: string) {
  if (editor.pages.length <= 1) return;
  if (!confirm(`Delete "${name}"?`)) return;
  await editor.deletePage(id);
}

async function removeCurrentPage() {
  const page = editor.currentPage;
  if (page) await remove(page.id, page.name);
}

// Layers — inline rename and delete.
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

async function select(id: string) {
  // Notebook mode is one continuous canvas — scroll to the sheet instead of
  // switching pages. Free mode switches the visible page.
  if (editor.notebookMode !== "off") editor.requestScrollToSheet(id);
  else await editor.selectPage(id);
  emit("close");
}

const backgrounds = [
  { id: "blank", label: "Blank" },
  { id: "ruled", label: "Ruled" },
  { id: "grid", label: "Grid" },
  { id: "dotted", label: "Dotted" },
] as const;

async function setBackground(value: "blank" | "ruled" | "grid" | "dotted") {
  // Background is a notebook-wide choice — apply it to every page, not just this one.
  for (const page of editor.pages) {
    await editor.setPageBackground(page.id, value);
  }
}

async function exportCurrentPage() {
  const page = editor.currentPage;
  if (!page) return;
  await exportPageAsPng(page, editor.strokes, editor.shapes, editor.images);
}

async function exportNotebookPdf() {
  if (editor.pages.length === 0) return;
  await exportNotebookPdfToPrint(editor.pages, editor.strokes, editor.shapes, editor.images);
}

const snapshotUrl = ref<string | null>(null);
const snapshotCopied = ref(false);

function snapshotKey(pageId: string) {
  return `drawshare:snapshot:${pageId}`;
}

watch(
  () => editor.currentPageId,
  (id) => {
    if (!id) {
      snapshotUrl.value = null;
      return;
    }
    snapshotUrl.value = localStorage.getItem(snapshotKey(id));
  },
  { immediate: true },
);

async function publishSnapshot() {
  const page = editor.currentPage;
  if (!page) return;
  // Snapshot only what's visible: drop content on hidden layers so the share
  // matches the editor and doesn't leak a hidden draft layer.
  const hidden = new Set(editor.layers.filter((l) => !l.visible).map((l) => l.id));
  const onVisibleLayer = (item: { layerId?: string }) => !item.layerId || !hidden.has(item.layerId);
  const pageStrokes = editor.strokes.filter((s) => s.pageId === page.id && onVisibleLayer(s));
  const pageShapes = editor.shapes.filter((s) => s.pageId === page.id && onVisibleLayer(s));
  const pageImages = editor.images.filter((i) => i.pageId === page.id && onVisibleLayer(i));
  const pageTexts = (page.texts ?? []).filter(onVisibleLayer);
  const encoded = await encodeSnapshot(page, pageStrokes, pageTexts, pageShapes, pageImages);
  const base = window.location.href.replace(/#.*$/, "");
  const url = `${base}#/s?d=${encoded}`;
  localStorage.setItem(snapshotKey(page.id), url);
  snapshotUrl.value = url;
  try {
    await navigator.clipboard.writeText(url);
    snapshotCopied.value = true;
    setTimeout(() => (snapshotCopied.value = false), 1500);
  } catch {
    /* noop */
  }
}

async function copySnapshotUrl() {
  if (!snapshotUrl.value) return;
  try {
    await navigator.clipboard.writeText(snapshotUrl.value);
    snapshotCopied.value = true;
    setTimeout(() => (snapshotCopied.value = false), 1500);
  } catch {
    /* noop */
  }
}

function removeSnapshot() {
  const id = editor.currentPageId;
  if (!id) return;
  localStorage.removeItem(snapshotKey(id));
  snapshotUrl.value = null;
}
</script>

<template>
  <div class="wrap" :class="{ 'is-open': open }">
    <div class="backdrop" @click="emit('close')"></div>

    <!-- Collapsed (desktop): a slim vertical dock with just the essentials —
         expand, theme, live session. The full title shows on hover. -->
    <div v-if="collapsed" class="mini-dock" :class="{ quiet: editor.isDrawing }" aria-label="Pages, collapsed">
      <button
        class="dock-btn dock-expand"
        @click="emit('toggle')"
        :title="`Open ${editor.project?.name ?? 'panel'} · ${editor.pages.length} page${editor.pages.length === 1 ? '' : 's'}`"
        aria-label="Expand pages panel"
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" fill-rule="evenodd" d="M10 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8zM9 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3zM4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" clip-rule="evenodd"/>
        </svg>
        <span class="dock-count" aria-hidden="true">{{ editor.pages.length }}</span>
      </button>
      <span class="dock-divider" aria-hidden="true"></span>
      <button
        class="dock-btn"
        @click="toggleTheme()"
        :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <svg v-if="isDark" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </button>
      <button
        class="dock-btn dock-live"
        :class="{ live: live.isHosting }"
        @click="emit('share')"
        :title="live.isHosting ? `Live session · ${live.code}` : 'Start a live session'"
        :aria-label="live.isHosting ? `Live session active, code ${live.code}` : 'Start a live session'"
      >
        <span v-if="live.isHosting" class="live-dot" aria-hidden="true"></span>
        <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
        </svg>
      </button>
    </div>

    <aside v-else class="panel" :class="{ quiet: editor.isDrawing }" aria-label="Pages and settings">

      <!-- ── Header ── -->
      <div class="panel-head">
        <button class="head-icon" @click="router.push({ name: 'app' })" title="Back to projects" aria-label="Back to projects">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
        </button>
        <input
          v-model="projectName"
          class="project-name"
          aria-label="Project name"
          @blur="commitName"
          @keydown.enter="onNameEnter"
          :placeholder="editor.project?.name ?? 'Untitled'"
        />
        <span class="save-chip" :class="{ saving: editor.saving > 0 }" role="status" aria-live="polite">{{ saveStatus }}</span>
        <div class="head-menu-wrap">
          <button class="head-icon" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen" aria-haspopup="true" title="More" aria-label="More options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          <div v-if="menuOpen" class="head-menu" role="menu">
            <button class="head-menu-item" role="menuitem" @click="toggleTheme(); menuOpen = false">
              <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
              <span>{{ isDark ? 'Light mode' : 'Dark mode' }}</span>
            </button>
            <button class="head-menu-item" role="menuitem" @click="toggleFullscreen(); menuOpen = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
              <span>{{ isFullscreen ? 'Exit fullscreen' : 'Fullscreen' }}</span>
            </button>
            <button class="head-menu-item" :class="{ 'is-on': devMode }" role="menuitemcheckbox" :aria-checked="devMode" @click="setDevMode(!devMode); menuOpen = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m8 9-3 3 3 3" /><path d="m16 9 3 3-3 3" /><path d="M13.5 7.5 10 17" />
              </svg>
              <span>Dev mode</span>
            </button>
          </div>
        </div>
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
      <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false"></div>

      <!-- ── Body: single scrolling column ── -->
      <div class="panel-body">

        <!-- Pages: a horizontal filmstrip so it stays one row tall and every
             section below gets the panel's full width. -->
        <section class="film-section" data-tour="pages">
          <div class="section-head">
            <span class="section-title">Pages</span>
            <button class="btn-icon" @click="editor.addPage()" title="Add page" aria-label="Add new page">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            </button>
          </div>
          <ul class="film">
            <li v-for="page in editor.pages" :key="page.id">
              <button
                class="film-thumb"
                :class="{ active: editor.currentPageId === page.id }"
                @click="select(page.id)"
                :title="page.name"
                :aria-label="`Go to ${page.name}`"
                :aria-current="editor.currentPageId === page.id ? 'page' : undefined"
              >
                <img v-if="thumbnails[page.id]" :src="thumbnails[page.id]" class="film-img" :alt="`Preview of ${page.name}`" aria-hidden="true" />
                <span v-else class="film-ph">{{ page.index + 1 }}</span>
                <span class="film-badge">{{ page.index + 1 }}</span>
              </button>
            </li>
          </ul>
          <!-- Notebook: scroll the sheet stack vertically or horizontally. -->
          <div v-if="editor.notebookMode !== 'off'" class="layout-row">
            <span class="layout-label" id="nb-layout-label">Layout</span>
            <div class="mode-btns layout-btns" role="group" aria-labelledby="nb-layout-label">
              <button class="mode-btn" :class="{ active: editor.notebookLayout === 'vertical' }" :aria-pressed="editor.notebookLayout === 'vertical'" @click="editor.setNotebookLayout('vertical')">Vertical</button>
              <button class="mode-btn" :class="{ active: editor.notebookLayout === 'horizontal' }" :aria-pressed="editor.notebookLayout === 'horizontal'" @click="editor.setNotebookLayout('horizontal')">Horizontal</button>
            </div>
          </div>
        </section>

        <!-- Current page: rename + delete -->
        <div class="page-name-row">
          <input
            v-model="pageName"
            class="page-name-input"
            aria-label="Page name"
            @blur="commitPageName"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            :placeholder="editor.currentPage?.name ?? 'Page'"
          />
          <button v-if="editor.pages.length > 1" class="head-icon" @click="removeCurrentPage" title="Delete page" aria-label="Delete this page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
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
            <button
              class="layer-icon-btn"
              @click.stop="editor.toggleLayerVisibility(layer.id)"
              :title="layer.visible ? 'Hide layer' : 'Show layer'"
              :aria-label="layer.visible ? 'Hide layer' : 'Show layer'"
              :aria-pressed="layer.visible"
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
            <button
              class="layer-icon-btn"
              @click.stop="editor.toggleLayerLock(layer.id)"
              :title="layer.locked ? 'Unlock layer' : 'Lock layer'"
              :aria-label="layer.locked ? 'Unlock layer' : 'Lock layer'"
              :aria-pressed="layer.locked"
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
            <input
              v-if="renamingLayerId === layer.id"
              v-model="renameLayerValue"
              class="input layer-rename"
              :aria-label="`Rename layer: ${layer.name}`"
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

      <!-- ── Background (collapsible) ── -->
      <div class="section group-section">
        <button class="group-toggle" :aria-expanded="showSetup" @click="showSetup = !showSetup">
          <span class="section-title">Background</span>
          <svg class="chev" :class="{ open: showSetup }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <div v-if="showSetup" class="group-body">
      <div class="subsection">
        <div class="bg-grid">
          <button
            v-for="b in backgrounds"
            :key="b.id"
            class="bg-btn"
            :class="{ active: editor.currentPage?.background === b.id }"
            :aria-pressed="editor.currentPage?.background === b.id"
            :aria-label="`${b.label} background`"
            @click="setBackground(b.id)"
          >
            {{ b.label }}
          </button>
        </div>
      </div>

        </div>
      </div>

      <!-- ── Share & export (collapsible: snapshot, record, export, clear) ── -->
      <div class="section group-section">
        <button class="group-toggle" :aria-expanded="showActions" @click="showActions = !showActions">
          <span class="section-title">Share &amp; export</span>
          <svg class="chev" :class="{ open: showActions }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <div v-if="showActions" class="group-body">
          <!-- Live session -->
          <button class="share-btn" data-tour="share" :class="{ live: live.isHosting }" @click="emit('share')" :title="live.isHosting ? `Live session: ${live.code}` : 'Start a live session'" :aria-label="live.isHosting ? `Live session active, code: ${live.code}` : 'Start a live session'">
            <span v-if="live.isHosting" class="live-dot" aria-hidden="true"></span>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
            </svg>
            <span class="share-label">{{ live.isHosting ? `Live · ${live.code}` : 'Share live session' }}</span>
          </button>

          <!-- Export / clear -->
          <div class="page-tools">
            <button class="tool-btn" @click="exportCurrentPage" title="Export page as PNG" aria-label="Export page as PNG">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export PNG</span>
            </button>
            <button v-if="editor.notebookMode !== 'off'" class="tool-btn" @click="exportNotebookPdf" title="Export all pages as PDF" aria-label="Export notebook as PDF">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 18h4"/>
              </svg>
              <span>Export PDF</span>
            </button>
            <button class="tool-btn" @click="clearPage" title="Clear all strokes" aria-label="Clear all strokes on this page">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
              <span>Clear page</span>
            </button>
          </div>

          <!-- Record session -->
          <div class="subsection">
            <div class="record-row">
              <span class="sub-title">Record session</span>
              <button class="rec-toggle" role="switch" aria-label="Record session" :aria-checked="editor.recordReplay" :class="{ on: editor.recordReplay }" @click="editor.setRecordReplay(!editor.recordReplay)">
                <span class="rec-knob"></span>
              </button>
            </div>
            <p class="mode-hint">
              Records every edit so replay shows exactly what happened — erasing, moving,
              undo. Off, replay reconstructs the drawing from its final state.
            </p>
          </div>

          <!-- Snapshot link -->
          <div class="subsection">
            <div class="sub-title">Snapshot link</div>
            <template v-if="!snapshotUrl">
              <button class="share-btn" @click="publishSnapshot">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span class="share-label">Create snapshot link</span>
              </button>
            </template>
            <template v-else>
              <div class="snapshot-url-row">
                <input class="input snapshot-input" :value="snapshotUrl" readonly aria-label="Snapshot link" @focus="($event.target as HTMLInputElement).select()" />
                <button class="btn snapshot-copy-btn" @click="copySnapshotUrl">{{ snapshotCopied ? 'Copied!' : 'Copy' }}</button>
              </div>
              <div class="snapshot-actions">
                <button class="page-action danger" @click="removeSnapshot">Remove link</button>
              </div>
              <p class="snapshot-note muted">Anyone with this link can still view it</p>
            </template>
          </div>
        </div>
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
  bottom: 8px;
  width: var(--sidepanel-w);
  z-index: 10;
  background: var(--color-glass-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  scrollbar-width: thin;
  transform-origin: top right;
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease;
}

/* ── Body: one scrolling column, every section full width ── */
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}

/* Pages as a horizontal filmstrip — stays one row tall so it never steals
   width from the layers/setup sections below. */
.film-section {
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.film {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  /* Scrollable by drag/wheel/swipe, but no visible scrollbar. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.film::-webkit-scrollbar { display: none; }
.film > li { flex: 0 0 auto; }
.film-thumb {
  position: relative;
  display: block;
  width: 48px;
  aspect-ratio: 1 / 1.3;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg);
  overflow: hidden;
  transition: border-color 80ms ease, box-shadow 80ms ease;
}
.film-thumb.active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-soft);
}
.film-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.film-ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}
.film-badge {
  position: absolute;
  left: 3px;
  bottom: 2px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-bg) 70%, transparent);
  color: var(--color-text-muted);
}
.film-thumb.active .film-badge { color: var(--color-accent); }

.page-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.page-name-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 650;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
}
.page-name-input:hover {
  background: var(--color-surface-2);
}
.page-name-input:focus {
  outline: none;
  background: var(--color-surface-2);
}

.panel.quiet {
  opacity: 0.12;
  pointer-events: none;
  transition: opacity 150ms ease;
}

/* ── Collapsed: slim vertical dock ── */
.mini-dock {
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--color-glass-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border);
  border-radius: 14px;
  box-shadow: 0 8px 24px var(--color-glass-shadow), 0 2px 6px var(--color-glass-shadow);
  transition: opacity 150ms ease;
}
.mini-dock.quiet {
  opacity: 0.12;
  pointer-events: none;
}
.dock-btn {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.dock-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.dock-expand {
  color: var(--color-text);
}
.dock-count {
  position: absolute;
  right: 3px;
  bottom: 3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  border-radius: 7px;
  background: var(--color-accent);
  color: var(--color-accent-text);
}
.dock-divider {
  width: 22px;
  height: 1px;
  background: var(--color-border);
}
.dock-live.live {
  color: var(--color-accent);
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
  /* Above .menu-backdrop (z-index 15) so the overflow dropdown — which lives in
     this header's stacking context — stays clickable rather than being covered. */
  z-index: 20;
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

/* ── Collapsible groups (progressive disclosure) ── */
.group-section {
  padding: 0;
}
.group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-3);
  color: var(--color-text-muted);
  transition: background 80ms ease;
}
.group-toggle:hover {
  background: var(--color-surface-2);
}
.group-toggle .section-title {
  margin-bottom: 0;
}
.chev {
  flex-shrink: 0;
  transition: transform 150ms ease;
}
.chev.open {
  transform: rotate(90deg);
}
.group-body {
  padding: 0 var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.subsection {
  display: flex;
  flex-direction: column;
}
.sub-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.record-row .sub-title {
  margin-bottom: 0;
}

/* ── Header overflow menu ── */
.head-menu-wrap {
  position: relative;
  display: flex;
}
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 15;
}
.head-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 16;
  min-width: 168px;
  padding: 4px;
  background: var(--color-glass-bg-strong, var(--color-surface));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--color-glass-border, var(--color-border));
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.head-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text);
  transition: background 80ms ease;
}
.head-menu-item:hover {
  background: var(--color-surface-2);
}
.head-menu-item.is-on {
  color: var(--color-accent);
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

/* ── Canvas mode ── */
.mode-btns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
}

.mode-btn {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  padding: var(--space-2) var(--space-1);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.mode-btn:hover { background: var(--color-surface-2); color: var(--color-text); }
.mode-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}
.mode-btn-strict.active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #fff;
}

.mode-hint {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.4;
}

.layout-row {
  margin-top: var(--space-3);
}
.layout-label {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.layout-btns {
  grid-template-columns: 1fr 1fr;
}

/* ── Session recording toggle ── */
.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.rec-toggle {
  flex: none;
  width: 38px;
  height: 22px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-2);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.rec-toggle.on {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
.rec-knob {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease;
}
.rec-toggle.on .rec-knob {
  transform: translateX(16px);
}

/* ── Layers ── */
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

.none-btn {
  width: 100%;
  margin-top: var(--space-2);
}

/* ── Orientation ── */
.orient-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.orient-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-glass-bg);
  padding: var(--space-2) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.orient-btn:hover { background: var(--color-surface-2); color: var(--color-text); }
.orient-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

/* ── Snapshot ── */
.snapshot-url-row {
  display: flex;
  gap: var(--space-2);
}

.snapshot-input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.snapshot-copy-btn {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 500;
  padding: 0 var(--space-3);
  height: 32px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.snapshot-copy-btn:hover {
  background: var(--color-surface-3, var(--color-surface-2));
  color: var(--color-text);
}

.snapshot-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

.snapshot-note {
  font-size: var(--text-xs);
  margin-top: var(--space-2);
  line-height: 1.4;
}

/* ── Touch devices (iPad, tablets): bigger tap targets so the dense controls —
   especially the per-layer visibility/lock/reorder/delete row — are reliably
   hittable with a finger rather than a mouse. ── */
@media (pointer: coarse) {
  .layer-icon-btn { width: 30px; height: 30px; }
  .layer-reorder .layer-icon-btn { height: 24px; }
  .layer-row { gap: 6px; padding: 6px var(--space-2); min-height: 44px; }
  .head-icon { width: 36px; height: 36px; }
  .btn-icon { width: 30px; height: 30px; }
  .head-menu-item { padding: 11px 12px; }
}

/* ── Mobile — slide-in drawer ── */
@media (max-width: 767px) {
  /* Collapse is a desktop affordance; on mobile the panel is a drawer. */
  .mini-dock { display: none; }
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
