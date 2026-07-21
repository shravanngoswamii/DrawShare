<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useTheme } from "@/composables/useTheme";
import { getTheme, type Mode } from "@/core/themes";

const { isDark, isSystem, activeThemeId, themes, toggleTheme, setTheme, useSystemTheme } =
  useTheme();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const pop = ref<HTMLElement | null>(null);
const pos = reactive({ top: 0, right: 0, maxHeight: 480 });

// The grid shows themes for the currently-resolved mode; the segment switches it.
const gridMode = computed<Mode>(() => (isDark.value ? "dark" : "light"));
const gridThemes = computed(() => themes.filter((t) => t.mode === gridMode.value));
const segment = computed(() => (isSystem.value ? "system" : gridMode.value));
const currentFamily = computed(() => getTheme(activeThemeId.value)?.family ?? "slate");

function familyInMode(family: string, mode: Mode): string {
  const id = `${family}-${mode}`;
  return getTheme(id) ? id : `slate-${mode}`;
}

function setMode(mode: "system" | Mode) {
  if (mode === "system") useSystemTheme();
  else setTheme(familyInMode(currentFamily.value, mode));
}
function choose(id: string) {
  setTheme(id);
  open.value = false;
}

function place() {
  const el = root.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  pos.top = Math.round(r.bottom + 6);
  pos.right = Math.round(Math.max(8, window.innerWidth - r.right));
  pos.maxHeight = Math.round(Math.min(480, window.innerHeight - r.bottom - 16));
}

function onDocPointer(e: MouseEvent) {
  const t = e.target as Node;
  if (root.value?.contains(t) || pop.value?.contains(t)) return;
  open.value = false;
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
function close() {
  open.value = false;
}
// The popover is fixed-positioned, so close it if the *page* scrolls (it would
// otherwise drift). But ignore scrolling *inside* the popover's own grid.
function onScroll(e: Event) {
  if (pop.value && e.target instanceof Node && pop.value.contains(e.target)) return;
  open.value = false;
}

watch(open, (v) => {
  if (v) {
    nextTick(place);
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("resize", close);
    window.removeEventListener("scroll", onScroll, true);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", close);
  window.removeEventListener("scroll", onScroll, true);
});
</script>

<template>
  <div ref="root" class="theme-menu">
    <button
      class="tm-toggle"
      @click="toggleTheme()"
      v-tooltip="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      <svg v-if="isDark" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
    <button
      class="tm-caret"
      :class="{ open }"
      @click="open = !open"
      :aria-expanded="open"
      aria-haspopup="menu"
      v-tooltip="'Choose theme'"
      aria-label="Choose theme"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="pop"
        class="tm-pop"
        role="menu"
        aria-label="Themes"
        :style="{ top: `${pos.top}px`, right: `${pos.right}px`, maxHeight: `${pos.maxHeight}px` }"
      >
        <div class="tm-seg" role="group" aria-label="Appearance">
          <button class="tm-seg-btn" :class="{ active: segment === 'system' }" @click="setMode('system')">System</button>
          <button class="tm-seg-btn" :class="{ active: segment === 'light' }" @click="setMode('light')">Light</button>
          <button class="tm-seg-btn" :class="{ active: segment === 'dark' }" @click="setMode('dark')">Dark</button>
        </div>
        <div class="tm-grid">
          <button
            v-for="t in gridThemes"
            :key="t.id"
            class="tm-tile"
            :class="{ active: activeThemeId === t.id }"
            role="menuitemradio"
            :aria-checked="activeThemeId === t.id"
            @click="choose(t.id)"
          >
            <span class="tm-prev" :style="{ background: t.bg }" aria-hidden="true">
              <span class="tm-prev-card" :style="{ background: t.surface }">
                <span class="tm-prev-bar" :style="{ background: t.swatch }"></span>
                <span class="tm-prev-line" :style="{ background: t.text }"></span>
                <span class="tm-prev-line tm-prev-line-short" :style="{ background: t.text }"></span>
              </span>
            </span>
            <span class="tm-tile-row">
              <span class="tm-tile-name">{{ t.name }}</span>
              <svg v-if="activeThemeId === t.id" class="tm-tile-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.theme-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.tm-toggle,
.tm-caret {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
.tm-toggle {
  width: 32px;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}
.tm-caret {
  width: 22px;
  border-left: none;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.tm-caret svg {
  transition: transform 150ms ease;
}
.tm-caret.open svg {
  transform: rotate(180deg);
}
.tm-toggle:hover,
.tm-caret:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
</style>

<!-- The popover is teleported to <body>, so its styles can't be scoped. -->
<style>
.tm-pop {
  position: fixed;
  z-index: 200;
  display: flex;
  flex-direction: column;
  width: 288px;
  max-width: calc(100vw - 16px);
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: tm-pop-in 130ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top right;
}
@keyframes tm-pop-in {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tm-pop {
    animation: none;
  }
}

.tm-seg {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 3px;
  margin-bottom: var(--space-2);
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.tm-seg-btn {
  padding: 5px 0;
  border-radius: calc(var(--radius-md) - 2px);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  transition: background 80ms ease, color 80ms ease;
}
.tm-seg-btn:hover {
  color: var(--color-text);
}
.tm-seg-btn.active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-xs);
}

.tm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tm-grid::-webkit-scrollbar {
  display: none;
}
.tm-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background 80ms ease;
}
.tm-tile:hover {
  background: var(--color-surface-2);
}

/* Mini theme sample: a "page" (bg) holding a surface card with an accent pill
   and two ink lines — a real glance of the palette. */
.tm-prev {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  padding: 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-xs);
  transition: box-shadow 80ms ease, transform 80ms ease;
}
.tm-tile:hover .tm-prev {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.tm-tile.active .tm-prev {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
}
.tm-prev-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  padding: 7px;
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.tm-prev-bar {
  width: 42%;
  height: 6px;
  border-radius: var(--radius-pill);
}
.tm-prev-line {
  width: 80%;
  height: 3px;
  border-radius: var(--radius-pill);
  opacity: 0.45;
}
.tm-prev-line-short {
  width: 55%;
}
.tm-tile-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
}
.tm-tile-name {
  flex: 1;
  font-size: var(--text-xs);
  font-weight: 550;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tm-tile-check {
  flex-shrink: 0;
  color: var(--color-accent);
}
.tm-tile.active .tm-tile-name {
  color: var(--color-accent);
}
</style>
