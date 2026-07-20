import { describe, expect, it } from "vitest";
import { useFeatures } from "./useFeatures";

describe("useFeatures", () => {
  it("defaults every feature on", () => {
    const { flags } = useFeatures();
    for (const value of Object.values(flags)) expect(value).toBe(true);
  });

  it("setFeature updates the shared flags object", () => {
    const { flags, setFeature } = useFeatures();
    setFeature("highlighter", false);
    expect(flags.highlighter).toBe(false);
    setFeature("highlighter", true);
  });

  it("resetFeatures restores every flag to its default", () => {
    const { flags, setFeature, resetFeatures } = useFeatures();
    setFeature("layers", false);
    setFeature("devMode", false);
    resetFeatures();
    expect(flags.layers).toBe(true);
    expect(flags.devMode).toBe(true);
  });

  it("returns the same reactive flags object across calls", () => {
    const a = useFeatures();
    const b = useFeatures();
    a.setFeature("fill", false);
    expect(b.flags.fill).toBe(false);
    a.setFeature("fill", true);
  });
});
