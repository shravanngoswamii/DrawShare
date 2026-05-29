<script setup lang="ts">
import { useEditorStore } from "@/stores/editor";
import type { Tool } from "@/core/types";

defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const editor = useEditorStore();

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "highlighter", label: "Highlighter", icon: "highlight" },
  { id: "text", label: "Text", icon: "text" },
  { id: "eraser", label: "Eraser", icon: "eraser" },
];

const colors = [
  "#0f172a",
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#b91c1c",
  "#7c3aed",
  "#0891b2",
  "#a16207",
];

const sizes = [2, 4, 6, 10, 16];
</script>

<template>
  <aside class="toolbar" :class="{ 'is-collapsed': collapsed, quiet: editor.isDrawing }" aria-label="Drawing tools">
    <button class="toggle-btn" @click="emit('toggle')" title="Collapse toolbar">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" d="M10 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8zM9 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3zM4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" clip-rule="evenodd"/>
      </svg>
    </button>
    <div class="toolbar-body">
      <div class="group">
      <button
        v-for="t in tools"
        :key="t.id"
        class="tool"
        :class="{ active: editor.tool === t.id }"
        :aria-pressed="editor.tool === t.id"
        :title="t.label"
        @click="editor.setTool(t.id)"
      >
        <svg
          v-if="t.icon === 'pen'"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          <path d="m15 5 4 4" />
        </svg>
        <svg
          v-else-if="t.icon === 'highlight'"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 11-6 6v3h9l3-3" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
        <svg
          v-else-if="t.icon === 'text'"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7V5h16v2" />
          <path d="M12 5v14" />
          <path d="M9 19h6" />
        </svg>
        <svg
          v-else
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </svg>
      </button>
    </div>

    <div class="divider"></div>

    <div class="group sizes">
      <button
        v-for="s in sizes"
        :key="s"
        class="size"
        :class="{ active: editor.size === s }"
        :title="`${s}px`"
        @click="editor.setSize(s)"
      >
        <span
          class="size-dot"
          :style="{ width: `${Math.min(s, 14)}px`, height: `${Math.min(s, 14)}px` }"
        ></span>
      </button>
    </div>

    <div class="divider"></div>

    <div class="group colors">
      <button
        v-for="c in colors"
        :key="c"
        class="swatch"
        :class="{ active: editor.color === c }"
        :style="{ background: c }"
        :title="c"
        @click="editor.setColor(c)"
      ></button>
    </div>

    <div class="divider"></div>

    <div class="group">
      <button class="tool" title="Undo" @click="editor.undo()" :disabled="editor.history.length === 0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
        </svg>
      </button>
      <button class="tool" title="Redo" @click="editor.redo()" :disabled="editor.redoStack.length === 0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
        </svg>
      </button>
    </div>
    </div><!-- toolbar-body -->
  </aside>
</template>

<style scoped>
/* ── Floating glass panel — desktop ── */
.toolbar {
  position: absolute;
  left: 8px;
  top: 8px;
  bottom: 8px;
  width: var(--toolbar-w);
  z-index: 10;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2) 0;
  gap: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  transform-origin: top left;
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease;
}

.toolbar::-webkit-scrollbar { display: none; }

.toolbar.is-collapsed {
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
}

.toolbar.quiet {
  opacity: 0.12;
  pointer-events: none;
  transition: opacity 150ms ease;
}

.toggle-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: background 80ms ease, color 80ms ease;
}

.toggle-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.toolbar-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  width: 100%;
}

.group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.divider {
  width: 32px;
  height: 1px;
  background: var(--color-border);
  margin: var(--space-2) 0;
  flex-shrink: 0;
}

.tool {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
  flex-shrink: 0;
}

.tool:hover:not(:disabled) {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tool.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.size {
  width: 36px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.size:hover { background: var(--color-surface-2); }
.size.active { background: var(--color-accent-soft); }

.size-dot {
  display: block;
  background: var(--color-text);
  border-radius: var(--radius-pill);
}

.swatch {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(15, 23, 42, 0.12);
  transition: transform 80ms ease, box-shadow 80ms ease;
  flex-shrink: 0;
}

.swatch:hover { transform: scale(1.08); }

.swatch.active {
  box-shadow: 0 0 0 2px rgba(255,255,255,0.88), 0 0 0 4px var(--color-accent);
}

/* ── Mobile — horizontal bottom bar ── */
@media (max-width: 767px) {
  .toolbar {
    position: static;
    width: 100%;
    height: var(--toolbar-h);
    flex-direction: row;
    background: var(--color-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-radius: 0;
    border: none;
    border-top: 1px solid var(--color-border);
    box-shadow: none;
    padding: 0 var(--space-3);
    padding-bottom: var(--safe-bottom);
    gap: var(--space-2);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    justify-content: flex-start;
    transform: none !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  .toolbar::-webkit-scrollbar { display: none; }
  .toggle-btn { display: none; }

  .toolbar-body {
    display: contents;
  }

  .group {
    flex-direction: row;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .divider {
    width: 1px;
    height: 24px;
    margin: 0 var(--space-1);
  }

  .tool { width: 40px; height: 40px; }
  .size { width: 32px; height: 40px; }
}
</style>
