import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useLiveStore } from "./live";

function hostWithMessage() {
  const live = useLiveStore();
  live.mode = "host";
  live.appendChat({ id: "m1", fromId: "v1", fromName: "Viewer", text: "hi", ts: 1 });
  return live;
}

describe("chat reactions", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("toggles my own reaction on and off", () => {
    const live = hostWithMessage();
    expect(live.chat[0].reactions).toBeUndefined();

    live.toggleReaction("m1", "👍");
    expect(live.chat[0].reactions).toEqual({ "👍": ["host"] });

    live.toggleReaction("m1", "👍");
    // Empty emoji buckets are dropped entirely.
    expect(live.chat[0].reactions).toEqual({});
  });

  it("aggregates reactions from several people", () => {
    const live = hostWithMessage();
    live.applyChatReaction("m1", "❤️", "v1", "add");
    live.applyChatReaction("m1", "❤️", "v2", "add");
    expect(live.chat[0].reactions).toEqual({ "❤️": ["v1", "v2"] });

    live.applyChatReaction("m1", "❤️", "v1", "remove");
    expect(live.chat[0].reactions).toEqual({ "❤️": ["v2"] });
  });

  it("does nothing while offline", () => {
    const live = useLiveStore();
    live.mode = "off";
    live.appendChat({ id: "m2", fromId: "v1", fromName: "Viewer", text: "hi", ts: 2 });
    live.toggleReaction("m2", "👍");
    expect(live.chat[0].reactions).toBeUndefined();
  });
});
