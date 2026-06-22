import { computed, ref } from "vue";
import {
  buildThemesCss,
  DEFAULT_DARK_ID,
  DEFAULT_LIGHT_ID,
  getTheme,
  modeOf,
  oppositeMode,
  THEMES,
} from "@/core/themes";

// Theme preference is either "system" (follow the OS, neutral slate) or an
// explicit theme id like "blue-dark". Mode (light/dark) and the chosen palette
// both live here; the actual colours are CSS custom properties — selecting a
// theme just sets data-mode + data-theme on <html> and the rules in tokens.css
// / the injected theme stylesheet take over.

const KEY = "drawshare-theme";

function stored(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light") return DEFAULT_LIGHT_ID; // migrate the old 2-state values
    if (v === "dark") return DEFAULT_DARK_ID;
    if (v && getTheme(v)) return v;
  } catch {}
  return "system";
}

const systemDark = ref(
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false,
);
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    systemDark.value = e.matches;
    if (transient.value === null && preference.value === "system") applyEffective();
  });
}

const preference = ref<string>(stored());

// A transient theme that overrides the saved preference for the current view
// without persisting it — the live viewer uses this to mirror the host. null
// means "fall back to the saved preference". An explicit pick (persist) clears
// it, so the user's own choice always wins and sticks.
const transient = ref<string | null>(null);

function effective(): string {
  return transient.value ?? preference.value;
}

// Inject the generated theme stylesheet once (covers every non-default theme).
function ensureThemeStyles() {
  if (typeof document === "undefined" || document.getElementById("ds-theme-styles")) return;
  const style = document.createElement("style");
  style.id = "ds-theme-styles";
  style.textContent = buildThemesCss();
  document.head.appendChild(style);
}

function apply(pref: string) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (pref === "system") {
    el.setAttribute("data-mode", systemDark.value ? "dark" : "light");
    el.removeAttribute("data-theme");
    return;
  }
  el.setAttribute("data-mode", modeOf(pref));
  el.setAttribute("data-theme", pref);
}

function applyEffective() {
  apply(effective());
}

ensureThemeStyles();
applyEffective();

// Increments on every explicit user pick (not on mirroring). The live viewer
// watches this to stop following the host once the user chooses their own.
const pickCount = ref(0);

function persist(pref: string) {
  transient.value = null; // an explicit choice overrides any mirrored theme
  preference.value = pref;
  pickCount.value += 1;
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  applyEffective();
}

// Apply a theme for this view only, without saving it. Passing null restores
// the saved preference.
function mirrorTheme(id: string | null) {
  transient.value = id;
  applyEffective();
}

export function useTheme() {
  const isDark = computed(() =>
    effective() === "system" ? systemDark.value : modeOf(effective()) === "dark",
  );
  const isSystem = computed(() => effective() === "system");
  // The concrete theme in effect (used to highlight the active swatch).
  const activeThemeId = computed(() =>
    effective() === "system"
      ? systemDark.value
        ? DEFAULT_DARK_ID
        : DEFAULT_LIGHT_ID
      : effective(),
  );

  // Quick light/dark flip used by the sun/moon buttons: keep the palette family,
  // just swap its mode. Operates on the theme actually in effect (so it flips
  // the mirrored theme on the viewer, not the hidden saved one). From "system"
  // it commits to an explicit slate.
  function toggleTheme() {
    const current = effective();
    if (current === "system") {
      persist(systemDark.value ? DEFAULT_LIGHT_ID : DEFAULT_DARK_ID);
    } else {
      persist(oppositeMode(current));
    }
  }

  function setTheme(id: string) {
    persist(id);
  }
  function useSystemTheme() {
    persist("system");
  }

  return {
    isDark,
    isSystem,
    activeThemeId,
    pickCount,
    themes: THEMES,
    toggleTheme,
    setTheme,
    useSystemTheme,
    mirrorTheme,
  };
}
