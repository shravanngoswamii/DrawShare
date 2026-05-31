import { computed, ref } from "vue";

type ThemePreference = "light" | "dark" | "system";

const KEY = "drawshare-theme";

function stored(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "system";
}

const systemDark = ref(
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false,
);

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    systemDark.value = e.matches;
  });
}

const preference = ref<ThemePreference>(stored());

function applyAttribute(p: ThemePreference) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (p === "dark") el.setAttribute("data-theme", "dark");
  else if (p === "light") el.setAttribute("data-theme", "light");
  else el.removeAttribute("data-theme");
}

// Apply immediately on module load to avoid flash of wrong theme.
applyAttribute(preference.value);

export function useTheme() {
  const isDark = computed(
    () => preference.value === "dark" || (preference.value === "system" && systemDark.value),
  );

  function toggleTheme() {
    const next = isDark.value ? "light" : "dark";
    preference.value = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    applyAttribute(next);
  }

  return { isDark, toggleTheme };
}
