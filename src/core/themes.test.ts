import { describe, expect, it } from "vitest";
import {
  buildThemesCss,
  DEFAULT_DARK_ID,
  DEFAULT_LIGHT_ID,
  getTheme,
  modeOf,
  oppositeMode,
  THEMES,
} from "./themes";

describe("themes registry", () => {
  it("offers dozens of light and dark themes", () => {
    const light = THEMES.filter((t) => t.mode === "light");
    const dark = THEMES.filter((t) => t.mode === "dark");
    expect(light.length).toBeGreaterThanOrEqual(10);
    expect(dark.length).toBeGreaterThanOrEqual(10);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length); // unique ids
  });

  it("keeps the default slate themes override-free (base palette untouched)", () => {
    expect(getTheme(DEFAULT_LIGHT_ID)?.tokens).toEqual({});
    expect(getTheme(DEFAULT_DARK_ID)?.tokens).toEqual({});
  });

  it("gives every non-default theme a full, valid palette", () => {
    const colour = /^(#[0-9a-f]{6}|rgba?\([^)]+\))$/;
    for (const theme of THEMES) {
      if (theme.id === DEFAULT_LIGHT_ID || theme.id === DEFAULT_DARK_ID) continue;
      expect(theme.tokens["--color-accent"], theme.id).toMatch(colour);
      expect(theme.tokens["--color-bg"], theme.id).toMatch(colour);
      expect(theme.tokens["--color-accent-text"]).toBe(
        theme.mode === "dark" ? "#0f172a" : "#ffffff",
      );
    }
  });

  it("derives mode from an id and finds the opposite-mode sibling", () => {
    expect(modeOf("blue-dark")).toBe("dark");
    expect(modeOf("blue-light")).toBe("light");
    expect(oppositeMode("blue-light")).toBe("blue-dark");
    expect(oppositeMode("emerald-dark")).toBe("emerald-light");
  });

  it("emits CSS only for non-default themes", () => {
    const css = buildThemesCss();
    expect(css).toContain('html[data-theme="blue-dark"]');
    expect(css).not.toContain('html[data-theme="slate-light"]');
    expect(css).toContain("--color-accent:");
  });
});
