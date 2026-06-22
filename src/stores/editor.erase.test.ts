import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stroke } from "@/core/types";

// In-memory storage no-ops; eraseArea is synchronous + in-memory, so we assert
// on the store's stroke state, not persistence.
vi.mock("@/adapters/storage/indexedDB", () => ({
  storage: {
    putStroke: async () => {},
    putShape: async () => {},
    putImage: async () => {},
    putPage: async () => {},
    listLayers: async () => [],
    deleteStrokesForPage: async () => {},
    deleteShapesForPage: async () => {},
    deleteImagesForPage: async () => {},
  },
}));

import { useEditorStore } from "./editor";

function line(id: string, pts: Array<[number, number]>): Stroke {
  return {
    id,
    pageId: "pg1",
    tool: "pen",
    color: "#000",
    size: 2,
    opacity: 1,
    points: pts.map(([x, y]) => ({ x, y, p: 1, t: 0 })),
    createdAt: 0,
    layerId: "L1",
  };
}

describe("editor.eraseArea", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("leaves strokes whose bounding box can't reach the eraser untouched", () => {
    const editor = useEditorStore();
    editor.strokes = [
      line("far", [
        [1000, 1000],
        [1010, 1010],
      ]),
    ];

    const changed = editor.eraseArea("pg1", 0, 0, 10);

    expect(changed).toBe(false);
    expect(editor.strokes).toHaveLength(1);
    const s = editor.strokes[0];
    expect(s.id).toBe("far");
    expect(s.points.map((p) => [p.x, p.y])).toEqual([
      [1000, 1000],
      [1010, 1010],
    ]);
  });

  it("clips a stroke that passes through the eraser, keeping the far one intact", () => {
    const editor = useEditorStore();
    editor.strokes = [
      line("far", [
        [1000, 1000],
        [1010, 1010],
      ]),
      line("through", [
        [-50, 0],
        [50, 0],
      ]),
    ];

    const changed = editor.eraseArea("pg1", 0, 0, 10);

    expect(changed).toBe(true);
    // The far stroke survives unchanged.
    expect(editor.strokes.find((s) => s.id === "far")?.points).toHaveLength(2);
    // The through-stroke is clipped into the pieces outside the eraser, and no
    // surviving point lies inside the eraser radius.
    const pieces = editor.strokes.filter((s) => Math.abs(s.points[0].x) < 100);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const piece of pieces) {
      for (const pt of piece.points) {
        expect(Math.hypot(pt.x, pt.y)).toBeGreaterThanOrEqual(10 - 1e-6);
      }
    }
  });
});
