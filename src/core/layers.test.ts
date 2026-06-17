import { describe, expect, it } from "vitest";
import { orderByLayer } from "./layers";
import type { ImageItem, Layer, Shape, Stroke } from "./types";

function layer(id: string, index: number): Layer {
  return { id, pageId: "p", name: id, index, visible: true, locked: false, createdAt: 1 };
}
function stroke(id: string, layerId?: string): Stroke {
  return {
    id,
    pageId: "p",
    layerId,
    points: [],
    color: "#000",
    size: 4,
    opacity: 1,
    tool: "pen",
    createdAt: 1,
  };
}

describe("orderByLayer", () => {
  it("paints strokes bottom layer first, top layer last", () => {
    const layers = [layer("bottom", 0), layer("top", 1)];
    const strokes = [stroke("s-top", "top"), stroke("s-bottom", "bottom")];
    const out = orderByLayer(layers, strokes, [], [], []);
    const ids = out.map((r) => (r.item as Stroke).id);
    expect(ids).toEqual(["s-bottom", "s-top"]);
  });

  it("reordering layer index flips the draw order", () => {
    const strokes = [stroke("a", "L1"), stroke("b", "L2")];
    // L1 below L2 → a then b
    expect(
      orderByLayer([layer("L1", 0), layer("L2", 1)], strokes, [], [], []).map(
        (r) => (r.item as Stroke).id,
      ),
    ).toEqual(["a", "b"]);
    // L1 raised above L2 → b then a
    expect(
      orderByLayer([layer("L1", 1), layer("L2", 0)], strokes, [], [], []).map(
        (r) => (r.item as Stroke).id,
      ),
    ).toEqual(["b", "a"]);
  });

  it("keeps creation order within a layer", () => {
    const strokes = [stroke("first", "L"), stroke("second", "L")];
    expect(
      orderByLayer([layer("L", 0)], strokes, [], [], []).map((r) => (r.item as Stroke).id),
    ).toEqual(["first", "second"]);
  });

  it("groups unknown/absent layerId into the bottom layer", () => {
    const strokes = [stroke("top", "top"), stroke("orphan")];
    const out = orderByLayer([layer("bottom", 0), layer("top", 1)], strokes, [], [], []);
    expect(out.map((r) => (r.item as Stroke).id)).toEqual(["orphan", "top"]);
  });

  it("within a layer keeps behind-images, ink, then front-images", () => {
    const imgs: ImageItem[] = [
      {
        id: "front",
        pageId: "p",
        layerId: "L",
        src: "",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        z: 1,
        createdAt: 1,
      },
      {
        id: "behind",
        pageId: "p",
        layerId: "L",
        src: "",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        z: -1,
        createdAt: 1,
      },
    ];
    const out = orderByLayer([layer("L", 0)], [stroke("ink", "L")], [] as Shape[], imgs, []);
    expect(out.map((r) => r.item.id)).toEqual(["behind", "ink", "front"]);
  });
});
