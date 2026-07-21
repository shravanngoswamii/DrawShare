import { describe, expect, it } from "vitest";
import type { FeatureFlags } from "./useFeatures";
import { useFeatures } from "./useFeatures";

// Experimental features default off; every other flag defaults on.
const EXPERIMENTAL: (keyof FeatureFlags)[] = ["replayRecording"];

describe("useFeatures", () => {
  it("defaults every feature on except the experimental ones", () => {
    const { flags } = useFeatures();
    for (const [key, value] of Object.entries(flags)) {
      expect(value).toBe(!EXPERIMENTAL.includes(key as keyof FeatureFlags));
    }
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
    setFeature("replayRecording", true);
    resetFeatures();
    expect(flags.layers).toBe(true);
    expect(flags.devMode).toBe(true);
    expect(flags.replayRecording).toBe(false);
  });

  it("returns the same reactive flags object across calls", () => {
    const a = useFeatures();
    const b = useFeatures();
    a.setFeature("fill", false);
    expect(b.flags.fill).toBe(false);
    a.setFeature("fill", true);
  });
});
