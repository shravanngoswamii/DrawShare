import { describe, expect, it } from "vitest";
import { hashString, reconcile, type SyncEntry, type SyncState } from "./cloudSync";

const e = (id: string, updatedAt: number, hash: string): SyncEntry => ({ id, updatedAt, hash });

describe("reconcile", () => {
  it("pushes a project that exists only locally", () => {
    expect(reconcile([e("a", 1, "h1")], [], {})).toEqual([{ type: "push", id: "a" }]);
  });

  it("pulls a project that exists only on the remote", () => {
    expect(reconcile([], [e("a", 1, "h1")], {})).toEqual([{ type: "pull", id: "a" }]);
  });

  it("does nothing when both sides match the base", () => {
    const state: SyncState = { a: { updatedAt: 1, hash: "h1" } };
    expect(reconcile([e("a", 1, "h1")], [e("a", 1, "h1")], state)).toEqual([]);
  });

  it("pushes when only the local copy changed since base", () => {
    const state: SyncState = { a: { updatedAt: 1, hash: "h1" } };
    expect(reconcile([e("a", 2, "h2")], [e("a", 1, "h1")], state)).toEqual([
      { type: "push", id: "a" },
    ]);
  });

  it("pulls when only the remote copy changed since base", () => {
    const state: SyncState = { a: { updatedAt: 1, hash: "h1" } };
    expect(reconcile([e("a", 1, "h1")], [e("a", 2, "h2")], state)).toEqual([
      { type: "pull", id: "a" },
    ]);
  });

  it("flags a conflict when both sides changed since base", () => {
    const state: SyncState = { a: { updatedAt: 1, hash: "h1" } };
    expect(reconcile([e("a", 3, "hL")], [e("a", 2, "hR")], state)).toEqual([
      { type: "conflict", id: "a" },
    ]);
  });

  it("treats first-sync identical content as a rebase, not a transfer", () => {
    expect(reconcile([e("a", 5, "same")], [e("a", 9, "same")], {})).toEqual([
      { type: "rebase", id: "a" },
    ]);
  });

  it("conflicts on first sync when both have the id with different content", () => {
    expect(reconcile([e("a", 1, "hL")], [e("a", 1, "hR")], {})).toEqual([
      { type: "conflict", id: "a" },
    ]);
  });
});

describe("hashString", () => {
  it("is stable and differs on changed content", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
    expect(hashString("hello")).not.toBe(hashString("hello!"));
  });
});
