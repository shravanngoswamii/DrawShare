<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useTheme } from "@/composables/useTheme";

const { isDark, isSystem, activeThemeId, themes, toggleTheme, setTheme, useSystemTheme } =
  useTheme();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const lightThemes = computed(() => themes.filter((t) => t.mode === "light"));
const darkThemes = computed(() => themes.filter((t) => t.mode === "dark"));

function isActive(id: string) {
  return !isSystem.value && activeThemeId.value === id;
}
function choose(id: string) {
  setTheme(id);
  open.value = false;
}
function chooseSystem() {
  useSystemTheme();
  open.value = false;
}

function onDocPointer(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
watch(open, (v) => {
  if (v) {
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKeydown);
  } else {
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKeydown);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="root" class="theme-menu">
    <button
      class="tm-toggle"
      @click="toggleTheme()"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
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
      @click="open = !open"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="Choose theme"
      aria-label="Choose theme"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <div v-if="open" class="tm-dropdown" role="menu" aria-label="Themes">
      <button class="tm-item" :class="{ active: isSystem }" role="menuitemradio" :aria-checked="isSystem" @click="chooseSystem">
        <span class="tm-sw tm-sw-system" aria-hidden="true"></span>
        <span class="tm-name">System</span>
        <svg v-if="isSystem" class="tm-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      </button>

      <div class="tm-group">Light</div>
      <button
        v-for="t in lightThemes"
        :key="t.id"
        class="tm-item"
        :class="{ active: isActive(t.id) }"
        role="menuitemradio"
        :aria-checked="isActive(t.id)"
        @click="choose(t.id)"
      >
        <span class="tm-sw" :style="{ background: t.swatch }" aria-hidden="true"></span>
        <span class="tm-name">{{ t.name }}</span>
        <svg v-if="isActive(t.id)" class="tm-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      </button>

      <div class="tm-group">Dark</div>
      <button
        v-for="t in darkThemes"
        :key="t.id"
        class="tm-item"
        :class="{ active: isActive(t.id) }"
        role="menuitemradio"
        :aria-checked="isActive(t.id)"
        @click="choose(t.id)"
      >
        <span class="tm-sw" :style="{ background: t.swatch }" aria-hidden="true"></span>
        <span class="tm-name">{{ t.name }}</span>
        <svg v-if="isActive(t.id)" class="tm-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      </button>
    </div>
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
.tm-toggle:hover,
.tm-caret:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.tm-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  /* Fits inside the 248px desktop pages panel (overflow:hidden clips it). */
  width: 200px;
  max-height: min(360px, 60vh);
  overflow-y: auto;
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  scrollbar-width: thin;
}
.tm-group {
  padding: var(--space-2) var(--space-2) 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-subtle);
}
.tm-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 6px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text);
  text-align: left;
  transition: background 80ms ease;
}
.tm-item:hover {
  background: var(--color-surface-2);
}
.tm-item.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.tm-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-check {
  flex-shrink: 0;
  color: var(--color-accent);
}
.tm-sw {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border-strong);
}
.tm-sw-system {
  background: linear-gradient(135deg, #f8fafc 0 50%, #0f172a 50% 100%);
}
</style>
