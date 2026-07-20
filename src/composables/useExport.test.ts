import { describe, expect, it } from "vitest";
import { exportScale } from "./useExport";

describe("exportScale", () => {
  it("uses the full 4x upscale for a typical drawing", () => {
    expect(exportScale(800, 600)).toBe(4);
  });

  it("backs off so a large drawing's longest side stays under the cap", () => {
    const scale = exportScale(5000, 3000);
    expect(scale).toBeLessThan(4);
    expect(5000 * scale).toBeLessThanOrEqual(8000);
  });

  it("never drops below 1x even for a huge drawing", () => {
    expect(exportScale(50000, 20000)).toBe(1);
  });
});
