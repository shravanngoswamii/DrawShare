import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@/core/types";

// In-memory layers backend; the other storage methods are no-ops since these
// tests assert on the store's in-memory state, not persistence.
const layerDb = new Map<string, Layer>();
vi.mock("@/adapters/storage/indexedDB", () => ({
  storage: {
    listLayers: async (pageId: string) =>
      [...layerDb.values()].filter((l) => l.pageId === pageId).sort((a, b) => a.index - b.index),
    putLayer: async (l: Layer) => {
      layerDb.set(l.id, { ...l });
    },
    deleteLayer: async (id: string) => {
      layerDb.delete(id);
    },
    deleteLayersForPage: async (pageId: string) => {
      for (const [id, l] of layerDb) if (l.pageId === pageId) layerDb.delete(id);
    },
    putStroke: async () => {},
    putShape: async () => {},
    putImage: async () => {},
    putPage: async () => {},
    deleteStrokesForPage: async () => {},
    deleteShapesForPage: async () => {},
    deleteImagesForPage: async () => {},
  },
}));

import { useEditorStore } from "./editor";

function strokeOn(id: string, layerId: string) {
  return {
    id,
    pageId: "pg1",
    tool: "pen" as const,
    color: "#000",
    size: 2,
    opacity: 1,
    points: [{ x: 0, y: 0, p: 1, t: 0 }],
    createdAt: 0,
    layerId,
  };
}

describe("editor layers", () => {
  beforeEach(() => {
    layerDb.clear();
    setActivePinia(createPinia());
  });

  async function withDefaultLayer() {
    const editor = useEditorStore();
    editor.currentPageId = "pg1";
    await editor.loadLayers("pg1");
    return editor;
  }

  it("loadLayers creates a default 'Layer 1' and selects it", async () => {
    const editor = await withDefaultLayer();
    expect(editor.layers).toHaveLength(1);
    expect(editor.layers[0].name).toBe("Layer 1");
    expect(editor.currentLayerId).toBe(editor.layers[0].id);
  });

  it("addLayer appends and becomes the current layer", async () => {
    const editor = await withDefaultLayer();
    await editor.addLayer();
    expect(editor.layers).toHaveLength(2);
    expect(editor.layers[1].name).toBe("Layer 2");
    expect(editor.currentLayerId).toBe(editor.layers[1].id);
    expect(editor.layers[1].index).toBe(1);
  });

  it("deleteLayer moves its content down to the bottom layer", async () => {
    const editor = await withDefaultLayer();
    const bottom = editor.layers[0].id;
    await editor.addLayer();
    const top = editor.currentLayerId as string;
    editor.strokes = [strokeOn("s1", top), strokeOn("s2", bottom)];

    await editor.deleteLayer(top);

    expect(editor.layers).toHaveLength(1);
    expect(editor.layers[0].id).toBe(bottom);
    // s1 was on the deleted layer → reassigned to the bottom layer; s2 untouched.
    expect(editor.strokes.find((s) => s.id === "s1")?.layerId).toBe(bottom);
    expect(editor.strokes.find((s) => s.id === "s2")?.layerId).toBe(bottom);
  });

  it("undo of deleteLayer restores the layer and its content's assignment", async () => {
    const editor = await withDefaultLayer();
    await editor.addLayer();
    const top = editor.currentLayerId as string;
    editor.strokes = [strokeOn("s1", top)];

    await editor.deleteLayer(top);
    expect(editor.strokes[0].layerId).not.toBe(top);

    await editor.undo();
    expect(editor.layers.some((l) => l.id === top)).toBe(true);
    expect(editor.strokes.find((s) => s.id === "s1")?.layerId).toBe(top);
  });

  it("won't delete the only layer", async () => {
    const editor = await withDefaultLayer();
    await editor.deleteLayer(editor.layers[0].id);
    expect(editor.layers).toHaveLength(1);
  });

  it("hiding the current layer moves drawing focus elsewhere; selectLayer skips hidden/locked", async () => {
    const editor = await withDefaultLayer();
    const first = editor.layers[0].id;
    await editor.addLayer();
    const second = editor.currentLayerId as string;

    await editor.toggleLayerVisibility(second);
    expect(editor.currentLayerId).toBe(first); // focus left the hidden layer
    editor.selectLayer(second); // hidden → ignored
    expect(editor.currentLayerId).toBe(first);

    await editor.toggleLayerLock(first);
    editor.selectLayer(first); // locked → ignored
    expect(editor.currentLayerId).toBe(first);
  });

  it("moveLayerUp/Down reorders indexes", async () => {
    const editor = await withDefaultLayer();
    const a = editor.layers[0].id;
    await editor.addLayer();
    const b = editor.currentLayerId as string;
    await editor.moveLayerDown(b); // b (index 1) → index 0
    const idA = editor.layers.find((l) => l.id === a)?.index;
    const idB = editor.layers.find((l) => l.id === b)?.index;
    expect(idB).toBe(0);
    expect(idA).toBe(1);
  });
});
