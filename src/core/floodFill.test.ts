import { describe, expect, it } from "vitest";
import { findFillBounds, scanlineFill } from "./floodFill";

// Builds an RGBA buffer from a grid of '#' (black boundary) / '.' (white) rows.
function grid(rows: string[]): { data: Uint8ClampedArray; width: number; height: number } {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = rows[y][x] === "#" ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const FR = 255;
const FG = 0;
const FB = 0;
const FA = 255;
const FILL = [FR, FG, FB, FA];

describe("scanlineFill", () => {
  it("fills an enclosed region without touching the raster edge", () => {
    const { data, width, height } = grid(["#####", "#...#", "#...#", "#...#", "#####"]);
    const result = scanlineFill(data, width, height, 2, 2, FR, FG, FB, FA);
    expect(result).toEqual({ filled: true, edgeTouched: false });

    // Interior turned red; the black border is untouched.
    const at = (x: number, y: number) => [
      ...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4),
    ];
    expect(at(2, 2)).toEqual(FILL);
    expect(at(1, 1)).toEqual(FILL);
    expect(at(0, 0)).toEqual([0, 0, 0, 255]);
  });

  it("flags an open region that reaches the raster edge", () => {
    const { data, width, height } = grid(["...", "...", "..."]);
    const result = scanlineFill(data, width, height, 1, 1, FR, FG, FB, FA);
    expect(result).toEqual({ filled: true, edgeTouched: true });
  });

  it("refuses to start a fill on the boundary colour itself", () => {
    const { data, width, height } = grid(["#####", "#...#", "#####"]);
    const result = scanlineFill(data, width, height, 0, 0, FR, FG, FB, FA);
    expect(result).toEqual({ filled: false, edgeTouched: false });
  });

  it("is a no-op when the click point already matches the fill colour", () => {
    const { data, width, height } = grid(["#####", "#...#", "#####"]);
    scanlineFill(data, width, height, 2, 1, FR, FG, FB, FA);
    const result = scanlineFill(data, width, height, 2, 1, FR, FG, FB, FA);
    expect(result).toEqual({ filled: false, edgeTouched: false });
  });
});

describe("findFillBounds", () => {
  it("returns the bounding box of pixels matching the fill colour", () => {
    const { data, width, height } = grid(["#####", "#...#", "#...#", "#...#", "#####"]);
    scanlineFill(data, width, height, 2, 2, FR, FG, FB, FA);
    expect(findFillBounds(data, width, height, FR, FG, FB)).toEqual({
      minX: 1,
      minY: 1,
      maxX: 3,
      maxY: 3,
    });
  });

  it("returns null when no pixel matches the fill colour", () => {
    const { data, width, height } = grid(["###", "#.#", "###"]);
    expect(findFillBounds(data, width, height, FR, FG, FB)).toBeNull();
  });
});
