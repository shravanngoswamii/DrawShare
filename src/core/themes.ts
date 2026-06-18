// Theme registry. The app's look is driven entirely by the CSS custom
// properties in tokens.css; a theme just overrides a subset of them. To stay
// readable and consistent across dozens of palettes (rather than hand-tuning
// each), every non-default theme is *derived* from a compact seed: a brand
// accent plus a faint tint applied over the proven slate neutral scale. Text,
// semantics, shadows and focus come from the shared light/dark base (data-mode),
// so only ~16 colour tokens change per theme.
//
// "Slate" is the default and emits no overrides at all, so the out-of-the-box
// light/dark look is exactly the tokens.css base.

export type Mode = "light" | "dark";

export interface Theme {
  id: string; // `${family}-${mode}`, e.g. "blue-dark"
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

// ── slate neutral scale (copied from tokens.css) ─────────────────────────────
// The 12 surface/border/canvas/glass tokens each theme tints toward its accent.
// text, ink, semantics, shadows and focus are intentionally left to the base.

const SLATE: Record<Mode, Record<string, string>> = {
  light: {
    "--color-bg": "#f8fafc",
    "--color-surface": "#ffffff",
    "--color-surface-2": "#f1f5f9",
    "--color-surface-3": "#e2e8f0",
    "--color-border": "#e2e8f0",
    "--color-border-strong": "#cbd5e1",
    "--color-canvas-surface": "#ffffff",
    "--color-canvas-line": "#e2e8f0",
    "--color-canvas-dot": "#cbd5e1",
    "--color-glass-bg": "rgba(255, 255, 255, 0.88)",
    "--color-glass-bg-strong": "rgba(255, 255, 255, 0.97)",
    "--color-glass-border": "rgba(226, 232, 240, 0.8)",
  },
  dark: {
    "--color-bg": "#0f172a",
    "--color-surface": "#1e293b",
    "--color-surface-2": "#263548",
    "--color-surface-3": "#334155",
    "--color-border": "rgba(148, 163, 184, 0.12)",
    "--color-border-strong": "rgba(148, 163, 184, 0.22)",
    "--color-canvas-surface": "#1e293b",
    "--color-canvas-line": "rgba(148, 163, 184, 0.12)",
    "--color-canvas-dot": "rgba(148, 163, 184, 0.3)",
    "--color-glass-bg": "rgba(15, 23, 42, 0.85)",
    "--color-glass-bg-strong": "rgba(30, 41, 59, 0.96)",
    "--color-glass-border": "rgba(148, 163, 184, 0.15)",
  },
};

// Tint strength toward the accent — kept subtle so neutrals stay professional
// and text contrast is preserved. Dark surfaces take a touch more to read.
const TINT: Record<Mode, number> = { light: 0.05, dark: 0.08 };

function deriveTokens(mode: Mode, accentHex: string): Record<string, string> {
  const accent = parse(accentHex);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(SLATE[mode])) {
    out[key] = tint(value, accent, TINT[mode]);
  }
  out["--color-accent"] = format(accent);
  out["--color-accent-hover"] = format(
    mix(accent, parse(mode === "dark" ? "#ffffff" : "#000000"), 0.14),
  );
  out["--color-accent-soft"] = withAlpha(accent, mode === "dark" ? 0.18 : 0.12);
  out["--color-accent-text"] = mode === "dark" ? "#0f172a" : "#ffffff";
  return out;
}

// ── families ─────────────────────────────────────────────────────────────────
// Each family has a light accent (~600 level, white text) and a dark accent
// (~400 level, dark text). Slate is the default (neutral, no overrides).

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

// Exposed for the theme picker (one entry per palette, with both mode swatches).
export interface ThemeFamily {
  id: string;
  name: string;
  light: string;
  dark: string;
}
export const THEME_FAMILIES: ThemeFamily[] = FAMILIES.map(({ id, name, light, dark }) => ({
  id,
  name,
  light,
  dark,
}));

const MODES: Mode[] = ["light", "dark"];

export const THEMES: Theme[] = FAMILIES.flatMap((f) =>
  MODES.map((mode) => {
    const accent = mode === "dark" ? f.dark : f.light;
    return {
      id: `${f.id}-${mode}`,
      family: f.id,
      name: f.name,
      mode,
      swatch: accent,
      tokens: f.default ? {} : deriveTokens(mode, accent),
    };
  }),
);

export const DEFAULT_LIGHT_ID = "slate-light";
export const DEFAULT_DARK_ID = "slate-dark";

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string): Theme | undefined {
  return BY_ID.get(id);
}

export function modeOf(id: string): Mode {
  return getTheme(id)?.mode ?? (id.endsWith("-dark") ? "dark" : "light");
}

// The same family in the opposite mode (for the quick light/dark toggle).
export function oppositeMode(id: string): string {
  const theme = getTheme(id);
  if (!theme) return id;
  const other: Mode = theme.mode === "dark" ? "light" : "dark";
  return `${theme.family}-${other}`;
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
