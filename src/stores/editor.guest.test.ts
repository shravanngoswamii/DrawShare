import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, Project, Stroke } from "@/core/types";

// Spy-backed storage so we can assert guest mode never persists. Hoisted so the
// (also-hoisted) vi.mock factory can reference the spies.
const { putStroke, putImage } = vi.hoisted(() => ({
  putStroke: vi.fn(async () => {}),
  putImage: vi.fn(async () => {}),
}));
vi.mock("@/adapters/storage/indexedDB", () => ({
  storage: {
    putStroke,
    putImage,
    putShape: async () => {},
    putPage: async () => {},
    deleteStroke: async () => {},
    appendEvent: async () => {},
    listStrokes: async () => [],
    listShapes: async () => [],
    listImages: async () => [],
    listLayers: async () => [],
    putLayer: async () => {},
  },
}));

import { useEditorStore } from "./editor";
import { useLiveStore } from "./live";

function project(): Project {
  return {
    id: "host-proj",
    name: "Host board",
    createdAt: 0,
    updatedAt: 0,
    pageOrder: ["pg1"],
  } as Project;
}
function page(id: string): Page {
  return {
    id,
    projectId: "host-proj",
    index: 0,
    name: "Page 1",
    width: 0,
    height: 0,
    background: "blank",
    originX: 0,
    originY: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
function stroke(id: string, pageId = "pg1"): Stroke {
  return {
    id,
    pageId,
    tool: "pen",
    color: "#000",
    size: 2,
    opacity: 1,
    points: [{ x: 0, y: 0, p: 1, t: 0 }],
    createdAt: 0,
  };
}

function seedGuest() {
  const editor = useEditorStore();
  editor.beginGuestSession({
    project: project(),
    pages: [page("pg1")],
    currentPageId: "pg1",
    strokes: [stroke("seed")],
    shapes: [],
  });
  return editor;
}

describe("editor guest mode", () => {
  beforeEach(() => {
    putStroke.mockClear();
    putImage.mockClear();
    setActivePinia(createPinia());
    const live = useLiveStore();
    live.mode = "viewer";
    live.viewerId = "v1";
  });

  it("seeds the board from the host snapshot and flips into guest mode", () => {
    const editor = seedGuest();
    expect(editor.guest).toBe(true);
    expect(editor.project?.id).toBe("host-proj");
    expect(editor.strokes.map((s) => s.id)).toEqual(["seed"]);
    expect(editor.currentPageId).toBe("pg1");
  });

  it("commits a stroke locally, relays it to the host, and never persists", async () => {
    const editor = seedGuest();
    const live = useLiveStore();
    const sent = vi.spyOn(live, "sendViewerEdit");
    await editor.commitStroke(stroke("mine"));
    expect(editor.strokes.some((s) => s.id === "mine")).toBe(true);
    expect(putStroke).not.toHaveBeenCalled();
    expect(sent).toHaveBeenCalledWith(
      expect.objectContaining({ t: "viewer-stroke-commit", vid: "v1" }),
    );
  });

  it("relays an erase as a viewer-erase-stroke and drops it locally", async () => {
    const editor = seedGuest();
    const live = useLiveStore();
    const sent = vi.spyOn(live, "sendViewerEdit");
    await editor.eraseStroke("seed");
    expect(editor.strokes.some((s) => s.id === "seed")).toBe(false);
    expect(sent).toHaveBeenCalledWith(
      expect.objectContaining({ t: "viewer-erase-stroke", vid: "v1", strokeId: "seed" }),
    );
  });

  it("applies a host stroke broadcast without persisting or re-relaying", () => {
    const editor = seedGuest();
    const live = useLiveStore();
    const sent = vi.spyOn(live, "sendViewerEdit");
    editor.applyRemoteStrokeCommit(stroke("from-host"));
    editor.applyRemoteStrokeCommit(stroke("from-host")); // dedupes by id
    expect(editor.strokes.filter((s) => s.id === "from-host")).toHaveLength(1);
    expect(putStroke).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it("endGuestSession restores the host-capable (persisting) state", async () => {
    const editor = seedGuest();
    editor.endGuestSession();
    expect(editor.guest).toBe(false);
    // Back on the real adapter: a host commit persists again.
    editor.project = project();
    editor.currentPageId = "pg1";
    editor.pages = [page("pg1")];
    await editor.commitStroke(stroke("host-side"));
    expect(putStroke).toHaveBeenCalled();
  });
});
