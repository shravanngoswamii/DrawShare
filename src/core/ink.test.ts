import { describe, expect, it } from "vitest";
import { adaptInk, parseColor } from "./ink";

describe("parseColor", () => {
  it("parses hex3", () => {
    const result = parseColor("#abc");
    expect(result).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it("parses hex6", () => {
    const result = parseColor("#aabbcc");
    expect(result).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it("parses rgba()", () => {
    const result = parseColor("rgba(10, 20, 30, 0.5)");
    expect(result).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("returns null for invalid input", () => {
    expect(parseColor("notacolor")).toBeNull();
  });
});

describe("adaptInk", () => {
  it("is identity in light mode", () => {
    expect(adaptInk("#0f172a", false)).toBe("#0f172a");
    expect(adaptInk("#1d4ed8", false)).toBe("#1d4ed8");
  });

  it("flips near-black color in dark mode", () => {
    const result = adaptInk("#0f172a", true);
    expect(result).not.toBe("#0f172a");
  });

  it("leaves bright colors unchanged in dark mode", () => {
    expect(adaptInk("#1d4ed8", true)).toBe("#1d4ed8");
  });
});
