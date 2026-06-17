import { describe, expect, it } from "vitest";
import type { ImageItem, Page, Shape, Stroke, TextItem } from "@/core/types";
import { decodeSnapshot, encodeSnapshot } from "./useSnapshot";

const page: Page = {
  id: "pg1",
  projectId: "pr1",
  index: 0,
  name: "My Page",
  width: 794,
  height: 1123,
  background: "grid",
  createdAt: 0,
  updatedAt: 0,
};

const stroke: Stroke = {
  id: "s1",
  pageId: "pg1",
  tool: "pen",
  color: "#0f172a",
  size: 3,
  opacity: 1,
  points: [
    { x: 1, y: 2, p: 1, t: 0 },
    { x: 3, y: 4, p: 1, t: 10 },
  ],
  createdAt: 0,
};
const text: TextItem = {
  id: "t1",
  pageId: "pg1",
  x: 5,
  y: 6,
  text: "hello",
  color: "#000",
  size: 16,
  createdAt: 0,
};
const shape: Shape = {
  id: "sh1",
  pageId: "pg1",
  type: "rect",
  x1: 0,
  y1: 0,
  x2: 50,
  y2: 30,
  color: "#b91c1c",
  size: 2,
  opacity: 1,
  createdAt: 0,
};
const image: ImageItem = {
  id: "i1",
  pageId: "pg1",
  x: 10,
  y: 10,
  width: 40,
  height: 40,
  src: "data:image/png;base64,iVBORw0KGgo=",
  z: 1,
  createdAt: 0,
};

describe("snapshot encode/decode", () => {
  it("round-trips a full page (strokes, text, shapes, images)", async () => {
    const encoded = await encodeSnapshot(page, [stroke], [text], [shape], [image]);
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toMatch(/[+/=]/); // base64url, no +,/,= chars

    const decoded = await decodeSnapshot(encoded);
    expect(decoded.v).toBe(2);
    expect(decoded.name).toBe("My Page");
    expect(decoded.background).toBe("grid");
    expect(decoded.strokes).toEqual([stroke]);
    expect(decoded.texts).toEqual([text]);
    expect(decoded.shapes).toEqual([shape]);
    expect(decoded.images).toEqual([image]);
  });

  it("defaults shapes/images to empty when omitted", async () => {
    const encoded = await encodeSnapshot(page, [stroke], []);
    const decoded = await decodeSnapshot(encoded);
    expect(decoded.shapes).toEqual([]);
    expect(decoded.images).toEqual([]);
  });

  it("rejects garbage input", async () => {
    await expect(decodeSnapshot("!!!not-valid!!!")).rejects.toBeDefined();
  });
});
