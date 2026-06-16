import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { ImageItem, ReplayEvent, ReplayOp, Shape, Stroke, TextItem } from "@/core/types";
import { useReplayStore } from "./replay";

function stroke(id: string, pageId: string, lastT = 100): Stroke {
  return {
    id,
    pageId,
    tool: "pen",
    color: "#000",
    size: 2,
    opacity: 1,
    points: [
      { x: 0, y: 0, p: 1, t: 0 },
      { x: 10, y: 10, p: 1, t: lastT },
    ],
    createdAt: 0,
  };
}
function shape(id: string, pageId: string): Shape {
  return {
    id,
    pageId,
    type: "rect",
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 10,
    color: "#000",
    size: 2,
    opacity: 1,
    createdAt: 0,
  };
}
function image(id: string, pageId: string, x = 0): ImageItem {
  return { id, pageId, x, y: 0, width: 10, height: 10, src: "data:img", createdAt: 0 };
}
function text(id: string, pageId: string): TextItem {
  return { id, pageId, x: 0, y: 0, text: "hi", color: "#000", size: 16, createdAt: 0 };
}
function ev(t: number, op: ReplayOp, baseline = false): ReplayEvent {
  return { projectId: "p", t, op, baseline };
}

describe("replay event engine", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows an erased stroke during replay, then removes it (exact history)", () => {
    const r = useReplayStore();
    const A = stroke("A", "pg1", 100);
    const B = stroke("B", "pg1", 50);
    r.startEvents([
      ev(1000, { op: "stroke-add", stroke: A }),
      ev(2000, { op: "stroke-add", stroke: B }),
      ev(2500, { op: "stroke-remove", pageId: "pg1", id: "A" }),
    ]);
    expect(r.eventMode).toBe(true);

    // After A is drawn, before B and before the erase: only A is present.
    r.setTime(500);
    expect(r.displayStrokes.map((s) => s.id).sort()).toEqual(["A"]);

    // Both strokes present, erase not yet reached.
    r.setTime(860);
    expect(r.displayStrokes.map((s) => s.id).sort()).toEqual(["A", "B"]);

    // End of replay: A has been erased, only B survives.
    r.setTime(r.duration);
    expect(r.displayStrokes.map((s) => s.id).sort()).toEqual(["B"]);
  });

  it("renders baseline content instantly at t=0", () => {
    const r = useReplayStore();
    r.startEvents([
      ev(0, { op: "stroke-add", stroke: stroke("base", "pg1") }, true),
      ev(0, { op: "shape-add", shape: shape("sbase", "pg1") }, true),
      ev(1000, { op: "stroke-add", stroke: stroke("live", "pg1") }),
    ]);
    r.setTime(0);
    expect(r.displayStrokes.map((s) => s.id).sort()).toEqual(["base"]);
    expect(r.displayShapes.map((s) => s.id)).toEqual(["sbase"]);
  });

  it("applies image-set as a move (latest wins) and image-remove", () => {
    const r = useReplayStore();
    r.startEvents([
      ev(1000, { op: "image-set", image: image("img", "pg1", 0) }),
      ev(2000, { op: "image-set", image: image("img", "pg1", 99) }),
      ev(3000, { op: "image-remove", pageId: "pg1", id: "img" }),
    ]);
    r.setTime(r.duration / 2);
    const mid = r.displayImages.find((i) => i.id === "img");
    expect(mid?.x).toBe(99); // moved
    r.setTime(r.duration);
    expect(r.displayImages.find((i) => i.id === "img")).toBeUndefined(); // removed
  });

  it("text-set reveals and text-remove hides text ids", () => {
    const r = useReplayStore();
    r.startEvents([
      ev(1000, { op: "text-set", text: text("t1", "pg1") }),
      ev(2000, { op: "text-remove", pageId: "pg1", id: "t1" }),
    ]);
    // Partway: after the text-set (time 0) but before the text-remove (time 700).
    r.setTime(300);
    expect(r.displayTextIds.has("t1")).toBe(true);
    r.setTime(r.duration);
    expect(r.displayTextIds.has("t1")).toBe(false);
  });

  it("page-clear wipes all content on its page only", () => {
    const r = useReplayStore();
    r.startEvents([
      ev(1000, { op: "stroke-add", stroke: stroke("a", "pg1") }),
      ev(1100, { op: "shape-add", shape: shape("b", "pg1") }),
      ev(1200, { op: "text-set", text: text("c", "pg1") }),
      ev(1300, { op: "stroke-add", stroke: stroke("keep", "pg2") }),
      ev(2000, { op: "page-clear", pageId: "pg1" }),
    ]);
    r.setTime(r.duration);
    expect(r.displayStrokes.map((s) => s.id).sort()).toEqual(["keep"]);
    expect(r.displayShapes).toHaveLength(0);
    expect(r.displayTextIds.has("c")).toBe(false);
  });

  it("reconstruct mode (no events) still reveals strokes by createdAt", () => {
    const r = useReplayStore();
    const s = stroke("only", "pg1", 100);
    s.createdAt = 100;
    r.start({ strokes: [s], shapes: [], images: [], pages: [] });
    expect(r.eventMode).toBe(false);
    r.setTime(r.duration);
    expect(r.displayStrokes.map((x) => x.id)).toEqual(["only"]);
  });
});
