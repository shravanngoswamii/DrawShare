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
    if (preference.value === "system") apply("system");
  });
}

const preference = ref<string>(stored());

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

ensureThemeStyles();
apply(preference.value);

function persist(pref: string) {
  preference.value = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref);
}

export function useTheme() {
  const isDark = computed(() =>
    preference.value === "system" ? systemDark.value : modeOf(preference.value) === "dark",
  );
  const isSystem = computed(() => preference.value === "system");
  // The concrete theme in effect (used to highlight the active swatch).
  const activeThemeId = computed(() =>
    preference.value === "system"
      ? systemDark.value
        ? DEFAULT_DARK_ID
        : DEFAULT_LIGHT_ID
      : preference.value,
  );

  // Quick light/dark flip used by the sun/moon buttons: keep the palette family,
  // just swap its mode. From "system" it commits to an explicit slate.
  function toggleTheme() {
    if (preference.value === "system") {
      persist(systemDark.value ? DEFAULT_LIGHT_ID : DEFAULT_DARK_ID);
    } else {
      persist(oppositeMode(preference.value));
    }
  }

  function setTheme(id: string) {
    persist(id);
  }
  function useSystemTheme() {
    persist("system");
  }

  return { isDark, isSystem, activeThemeId, themes: THEMES, toggleTheme, setTheme, useSystemTheme };
}
