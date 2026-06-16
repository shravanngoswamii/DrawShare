import { describe, expect, it } from "vitest";
import { makeSessionCode } from "./sync";

const ALLOWED = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""));

describe("makeSessionCode", () => {
  it("returns a 6-character string", () => {
    expect(makeSessionCode()).toHaveLength(6);
  });

  it("only uses chars from the allowed set", () => {
    const code = makeSessionCode();
    for (const ch of code) {
      expect(ALLOWED.has(ch)).toBe(true);
    }
  });

  it("two calls return different values", () => {
    const a = makeSessionCode();
    const b = makeSessionCode();
    expect(a).not.toBe(b);
  });
});
