<script setup lang="ts">
import { useEditorStore } from "@/stores/editor";
import type { Tool } from "@/core/types";

const editor = useEditorStore();

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "pen" },
  { id: "highlighter", label: "Highlighter", icon: "highlight" },
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
  <aside class="toolbar" aria-label="Drawing tools">
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
        >
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
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
        >
          <path d="M9 14l-4 4 1 3 3 1 4-4" />
          <path d="M13 11l8-8 0 0 3 3-8 8" />
          <path d="M5 18l-2 5 5-2" />
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
        >
          <path d="M3 17l6 6 12-12-6-6L3 13z" />
          <path d="M9 23h13" />
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
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7v6h6" />
          <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
        </svg>
      </button>
      <button class="tool" title="Redo" @click="editor.redo()" :disabled="editor.redoStack.length === 0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 7v6h-6" />
          <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
        </svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.toolbar {
  width: var(--toolbar-w);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-3) 0;
  gap: var(--space-2);
  flex-shrink: 0;
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

.size:hover {
  background: var(--color-surface-2);
}

.size.active {
  background: var(--color-accent-soft);
}

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

.swatch:hover {
  transform: scale(1.08);
}

.swatch.active {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
}

/* Mobile - horizontal bottom bar */
@media (max-width: 767px) {
  .toolbar {
    width: 100%;
    height: var(--toolbar-h);
    flex-direction: row;
    border-right: none;
    border-top: 1px solid var(--color-border);
    padding: 0 var(--space-3);
    padding-bottom: var(--safe-bottom);
    gap: var(--space-2);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    justify-content: flex-start;
  }

  .toolbar::-webkit-scrollbar {
    display: none;
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

  .tool {
    width: 40px;
    height: 40px;
  }

  .size {
    width: 32px;
    height: 40px;
  }

  .swatch {
    width: 26px;
    height: 26px;
  }
}
</style>
