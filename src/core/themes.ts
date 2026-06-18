// Theme registry. The app's look is driven entirely by the CSS custom
// properties in tokens.css; a theme just overrides a subset of them. Every
// non-default theme's full palette is *derived* from a compact seed (background,
// surface, text and an accent) by buildTokens(), so adding a theme is a few
// colours rather than 20-odd hand-tuned tokens.
//
// Two kinds of theme:
//   • Colour families — the proven slate neutral scale, faintly tinted toward a
//     brand accent, in both light and dark.
//   • Signature themes — beloved editor/reading palettes (Sepia, Solarized,
//     Gruvbox, Dracula, Nord, …) with their own neutrals.
//
// "Slate" is the default and emits no overrides at all, so the out-of-the-box
// light/dark look is exactly the tokens.css base.

export type Mode = "light" | "dark";

export interface Theme {
  id: string; // always ends in "-light" or "-dark" (the FOUC script relies on it)
  family: string;
  name: string;
  mode: Mode;
  /** Representative colour for the picker swatch. */
  swatch: string;
  /** CSS custom-property overrides; empty for the default (slate). */
  tokens: Record<string, string>;
}

// ── colour maths ────────────────────────────────────────────────────────────

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parse(color: string): RGBA {
  const c = color.trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((x) => x + x)
        .join("");
    const n = Number.parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map((s) => Number.parseFloat(s.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function format(c: RGBA): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  if (c.a >= 1) {
    const hex = [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `#${hex}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(c.a * 1000) / 1000})`;
}

// Mix `base` toward `other` by `t` (0..1), keeping `base`'s alpha.
function mix(base: RGBA, other: RGBA, t: number): RGBA {
  return {
    r: base.r + (other.r - base.r) * t,
    g: base.g + (other.g - base.g) * t,
    b: base.b + (other.b - base.b) * t,
    a: base.a,
  };
}

function tint(value: string, accent: RGBA, t: number): string {
  return format(mix(parse(value), accent, t));
}

function withAlpha(c: RGBA, a: number): string {
  return format({ ...c, a });
}

// Perceptual luminance (0..1) — decides whether text on the accent is dark/light.
function luminance(c: RGBA): number {
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

// ── palette derivation ────────────────────────────────────────────────────────

interface Seed {
  mode: Mode;
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

function buildTokens(seed: Seed): Record<string, string> {
  const dark = seed.mode === "dark";
  const bg = parse(seed.bg);
  const surface = parse(seed.surface);
  const text = parse(seed.text);
  const accent = parse(seed.accent);
  const white = parse("#ffffff");
  const black = parse("#000000");

  const border = mix(surface, text, dark ? 0.16 : 0.12);
  const borderStrong = mix(surface, text, dark ? 0.28 : 0.22);

  return {
    "--color-bg": format(bg),
    "--color-surface": format(surface),
    "--color-surface-2": format(mix(surface, text, dark ? 0.06 : 0.05)),
    "--color-surface-3": format(mix(surface, text, dark ? 0.12 : 0.1)),
    "--color-border": format(border),
    "--color-border-strong": format(borderStrong),
    "--color-text": format(text),
    "--color-text-muted": format(mix(text, bg, 0.4)),
    "--color-text-subtle": format(mix(text, bg, 0.62)),
    "--color-canvas-surface": format(surface),
    "--color-canvas-line": format(border),
    "--color-canvas-dot": format(borderStrong),
    "--color-glass-bg": withAlpha(surface, 0.88),
    "--color-glass-bg-strong": withAlpha(surface, 0.97),
    "--color-glass-border": withAlpha(border, 0.85),
    "--color-ink": withAlpha(text, dark ? 0.6 : 0.55),
    "--color-ink-fill": withAlpha(text, dark ? 0.1 : 0.06),
    "--color-accent": format(accent),
    "--color-accent-hover": format(mix(accent, dark ? white : black, 0.14)),
    "--color-accent-soft": withAlpha(accent, dark ? 0.18 : 0.12),
    "--color-accent-text": luminance(accent) > 0.62 ? "#0f172a" : "#ffffff",
  };
}

// ── colour families (slate neutrals + a brand accent) ─────────────────────────

const SLATE_SEED: Record<Mode, { bg: string; surface: string; text: string }> = {
  light: { bg: "#f8fafc", surface: "#ffffff", text: "#0f172a" },
  dark: { bg: "#0f172a", surface: "#1e293b", text: "#f1f5f9" },
};

interface Family {
  id: string;
  name: string;
  light: string;
  dark: string;
  default?: boolean;
}

const FAMILIES: Family[] = [
  { id: "slate", name: "Slate", light: "#0f172a", dark: "#e2e8f0", default: true },
  { id: "graphite", name: "Graphite", light: "#3f3f46", dark: "#d4d4d8" },
  { id: "blue", name: "Blue", light: "#2563eb", dark: "#60a5fa" },
  { id: "indigo", name: "Indigo", light: "#4f46e5", dark: "#818cf8" },
  { id: "violet", name: "Violet", light: "#7c3aed", dark: "#a78bfa" },
  { id: "sky", name: "Sky", light: "#0284c7", dark: "#38bdf8" },
  { id: "teal", name: "Teal", light: "#0d9488", dark: "#2dd4bf" },
  { id: "emerald", name: "Emerald", light: "#059669", dark: "#34d399" },
  { id: "amber", name: "Amber", light: "#b45309", dark: "#fbbf24" },
  { id: "rose", name: "Rose", light: "#e11d48", dark: "#fb7185" },
  { id: "crimson", name: "Crimson", light: "#dc2626", dark: "#f87171" },
  { id: "fuchsia", name: "Fuchsia", light: "#c026d3", dark: "#e879f9" },
];

const MODES: Mode[] = ["light", "dark"];

function familyTheme(f: Family, mode: Mode): Theme {
  const accent = mode === "dark" ? f.dark : f.light;
  const s = SLATE_SEED[mode];
  const tokens = f.default
    ? {}
    : buildTokens({
        mode,
        bg: tint(s.bg, parse(accent), 0.05),
        surface: tint(s.surface, parse(accent), 0.04),
        text: s.text,
        accent,
      });
  return { id: `${f.id}-${mode}`, family: f.id, name: f.name, mode, swatch: accent, tokens };
}

// ── signature themes (famous editor / reading palettes) ───────────────────────

interface Signature {
  id: string; // ends in -light / -dark
  family: string;
  name: string;
  mode: Mode;
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

const SIGNATURES: Signature[] = [
  // Warm, bookish / paper
  {
    id: "sepia-light",
    family: "sepia",
    name: "Sepia",
    mode: "light",
    bg: "#f4ecd8",
    surface: "#fbf6e8",
    text: "#4b3f33",
    accent: "#9c6b3f",
  },
  {
    id: "solarized-light",
    family: "solarized",
    name: "Solarized Light",
    mode: "light",
    bg: "#fdf6e3",
    surface: "#eee8d5",
    text: "#586e75",
    accent: "#268bd2",
  },
  {
    id: "gruvbox-light",
    family: "gruvbox",
    name: "Gruvbox Light",
    mode: "light",
    bg: "#fbf1c7",
    surface: "#f4e8be",
    text: "#3c3836",
    accent: "#b57614",
  },
  // Dark classics
  {
    id: "solarized-dark",
    family: "solarized",
    name: "Solarized Dark",
    mode: "dark",
    bg: "#002b36",
    surface: "#073642",
    text: "#93a1a1",
    accent: "#268bd2",
  },
  {
    id: "gruvbox-dark",
    family: "gruvbox",
    name: "Gruvbox Dark",
    mode: "dark",
    bg: "#282828",
    surface: "#3c3836",
    text: "#ebdbb2",
    accent: "#fabd2f",
  },
  {
    id: "dracula-dark",
    family: "dracula",
    name: "Dracula",
    mode: "dark",
    bg: "#282a36",
    surface: "#343746",
    text: "#f8f8f2",
    accent: "#bd93f9",
  },
  {
    id: "nord-dark",
    family: "nord",
    name: "Nord",
    mode: "dark",
    bg: "#2e3440",
    surface: "#3b4252",
    text: "#eceff4",
    accent: "#88c0d0",
  },
  {
    id: "onedark-dark",
    family: "onedark",
    name: "One Dark",
    mode: "dark",
    bg: "#282c34",
    surface: "#31363f",
    text: "#abb2bf",
    accent: "#61afef",
  },
  {
    id: "tokyonight-dark",
    family: "tokyonight",
    name: "Tokyo Night",
    mode: "dark",
    bg: "#1a1b26",
    surface: "#24283b",
    text: "#c0caf5",
    accent: "#7aa2f7",
  },
  {
    id: "catppuccin-dark",
    family: "catppuccin",
    name: "Catppuccin",
    mode: "dark",
    bg: "#1e1e2e",
    surface: "#313244",
    text: "#cdd6f4",
    accent: "#cba6f7",
  },
];

function signatureTheme(s: Signature): Theme {
  return {
    id: s.id,
    family: s.family,
    name: s.name,
    mode: s.mode,
    swatch: s.accent,
    tokens: buildTokens(s),
  };
}

export const THEMES: Theme[] = [
  ...FAMILIES.flatMap((f) => MODES.map((mode) => familyTheme(f, mode))),
  ...SIGNATURES.map(signatureTheme),
];

export const DEFAULT_LIGHT_ID = "slate-light";
export const DEFAULT_DARK_ID = "slate-dark";

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string): Theme | undefined {
  return BY_ID.get(id);
}

export function modeOf(id: string): Mode {
  return getTheme(id)?.mode ?? (id.endsWith("-dark") ? "dark" : "light");
}

// The same family in the opposite mode for the quick light/dark toggle; falls
// back to the default slate when that family has no sibling (e.g. Dracula).
export function oppositeMode(id: string): string {
  const theme = getTheme(id);
  if (!theme) return id;
  const other: Mode = theme.mode === "dark" ? "light" : "dark";
  const sibling = `${theme.family}-${other}`;
  if (getTheme(sibling)) return sibling;
  return other === "dark" ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID;
}

// Generated CSS for every non-default theme. Injected once at startup; selecting
// a theme just sets data-theme on <html> and these rules apply.
export function buildThemesCss(): string {
  return THEMES.filter((t) => Object.keys(t.tokens).length > 0)
    .map((t) => {
      const body = Object.entries(t.tokens)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      return `html[data-theme="${t.id}"] {\n${body}\n}`;
    })
    .join("\n\n");
}
