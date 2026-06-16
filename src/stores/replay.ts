import { defineStore } from "pinia";
import type { ImageItem, Page, ReplayEvent, Shape, Stroke } from "@/core/types";

export type ReplaySpeed = 0.5 | 1 | 2;

// Longest real-world idle gap (ms) kept between consecutive items. Pauses longer
// than this are compressed so replay doesn't sit on dead air for minutes.
const GAP_CAP = 700;
// Minimum on-screen window (ms) for an animated stroke so partial reveal is visible.
const MIN_STROKE_MS = 60;
// Tail padding (ms) after the last item so replay ends on the finished drawing.
const TAIL_MS = 500;
// Hold (ms) on the starting canvas before recorded edits begin, when a baseline
// snapshot exists. Keeps the pre-existing content from being overwritten at t=0.
const BASELINE_HOLD_MS = 400;

type Kind = "stroke" | "shape" | "image" | "text";

interface Entry {
  kind: Kind;
  id: string;
  stroke?: Stroke;
  shape?: Shape;
  image?: ImageItem;
  startTime: number;
  endTime: number;
  // Event mode only: the forward op applied at startTime. A stroke-add op also
  // animates point-by-point across [startTime, endTime]; every other op is
  // instantaneous (startTime === endTime).
  event?: ReplayEvent["op"];
}

// The content snapshot to replay. Texts are read from each page (page.texts).
export interface ReplayContent {
  strokes: Stroke[];
  shapes: Shape[];
  images: ImageItem[];
  pages: Page[];
}

interface Raw {
  kind: Kind;
  id: string;
  stroke?: Stroke;
  shape?: Shape;
  image?: ImageItem;
  absStart: number;
  absEnd: number;
}

export const useReplayStore = defineStore("replay", {
  state: () => ({
    active: false,
    playing: false,
    speed: 1 as ReplaySpeed,
    time: 0, // current position ms
    duration: 0, // total duration ms
    timeline: [] as Entry[],
    // true → exact-history playback from a recorded event log (shows erasures,
    // moves, undo/redo); false → reconstruct-from-final (Phase 1 fallback).
    eventMode: false,
  }),
  getters: {
    progress(state): number {
      return state.duration > 0 ? state.time / state.duration : 0;
    },
    // Event mode: fold every op up to the current time into a live snapshot. A
    // stroke mid-draw is sliced proportionally; removals, moves (image-set) and
    // page-clears apply exactly as they happened, so the playback mirrors the
    // real editing session. Returns null in reconstruct mode.
    eventState(state): {
      strokes: Stroke[];
      shapes: Shape[];
      images: ImageItem[];
      textIds: Set<string>;
    } | null {
      if (!state.eventMode) return null;
      const t = state.time;
      const strokes = new Map<string, Stroke>();
      const shapes = new Map<string, Shape>();
      const images = new Map<string, ImageItem>();
      const texts = new Map<string, string>(); // textId → pageId (for page-clear)
      for (const e of state.timeline) {
        if (e.startTime > t || !e.event) continue;
        const op = e.event;
        switch (op.op) {
          case "stroke-add":
            if (e.endTime <= t) {
              strokes.set(op.stroke.id, op.stroke);
            } else {
              const pct = (t - e.startTime) / Math.max(1, e.endTime - e.startTime);
              const nPts = Math.max(2, Math.ceil(op.stroke.points.length * pct));
              strokes.set(op.stroke.id, { ...op.stroke, points: op.stroke.points.slice(0, nPts) });
            }
            break;
          case "stroke-remove":
            strokes.delete(op.id);
            break;
          case "shape-add":
            shapes.set(op.shape.id, op.shape);
            break;
          case "shape-remove":
            shapes.delete(op.id);
            break;
          case "image-set":
            images.set(op.image.id, op.image);
            break;
          case "image-remove":
            images.delete(op.id);
            break;
          case "text-set":
            texts.set(op.text.id, op.text.pageId);
            break;
          case "text-remove":
            texts.delete(op.id);
            break;
          case "page-clear":
            for (const [id, s] of strokes) if (s.pageId === op.pageId) strokes.delete(id);
            for (const [id, s] of shapes) if (s.pageId === op.pageId) shapes.delete(id);
            for (const [id, im] of images) if (im.pageId === op.pageId) images.delete(id);
            for (const [id, pageId] of texts) if (pageId === op.pageId) texts.delete(id);
            break;
        }
      }
      return {
        strokes: [...strokes.values()],
        shapes: [...shapes.values()],
        images: [...images.values()],
        textIds: new Set(texts.keys()),
      };
    },
    // Strokes revealed at the current time — fully drawn (endTime ≤ t) or sliced
    // proportionally while in their draw window.
    displayStrokes(state): Stroke[] {
      if (!state.active) return [];
      if (state.eventMode) return this.eventState?.strokes ?? [];
      const t = state.time;
      const result: Stroke[] = [];
      for (const e of state.timeline) {
        if (e.kind !== "stroke" || !e.stroke || e.startTime > t) continue;
        if (e.endTime <= t) {
          result.push(e.stroke);
        } else {
          const pct = (t - e.startTime) / Math.max(1, e.endTime - e.startTime);
          const nPts = Math.max(2, Math.ceil(e.stroke.points.length * pct));
          result.push({ ...e.stroke, points: e.stroke.points.slice(0, nPts) });
        }
      }
      return result;
    },
    // Shapes/images have no sub-item timing — they pop in at their createdAt.
    displayShapes(state): Shape[] {
      if (!state.active) return [];
      if (state.eventMode) return this.eventState?.shapes ?? [];
      const out: Shape[] = [];
      for (const e of state.timeline) {
        if (e.kind === "shape" && e.shape && e.startTime <= state.time) out.push(e.shape);
      }
      return out;
    },
    displayImages(state): ImageItem[] {
      if (!state.active) return [];
      if (state.eventMode) return this.eventState?.images ?? [];
      const out: ImageItem[] = [];
      for (const e of state.timeline) {
        if (e.kind === "image" && e.image && e.startTime <= state.time) out.push(e.image);
      }
      return out;
    },
    // Text ids revealed so far — render filters page.texts against this set.
    displayTextIds(state): Set<string> {
      if (!state.active) return new Set();
      if (state.eventMode) return this.eventState?.textIds ?? new Set();
      const ids = new Set<string>();
      for (const e of state.timeline) {
        if (e.kind === "text" && e.startTime <= state.time) ids.add(e.id);
      }
      return ids;
    },
  },
  actions: {
    setup(content: ReplayContent) {
      const raws: Raw[] = [];
      for (const s of content.strokes) {
        const dur = s.points[s.points.length - 1]?.t ?? 0;
        raws.push({
          kind: "stroke",
          id: s.id,
          stroke: s,
          absStart: s.createdAt - dur,
          absEnd: s.createdAt,
        });
      }
      for (const sh of content.shapes) {
        raws.push({
          kind: "shape",
          id: sh.id,
          shape: sh,
          absStart: sh.createdAt,
          absEnd: sh.createdAt,
        });
      }
      for (const im of content.images) {
        raws.push({
          kind: "image",
          id: im.id,
          image: im,
          absStart: im.createdAt,
          absEnd: im.createdAt,
        });
      }
      for (const p of content.pages) {
        for (const t of p.texts ?? []) {
          raws.push({ kind: "text", id: t.id, absStart: t.createdAt, absEnd: t.createdAt });
        }
      }
      if (raws.length === 0) {
        this.timeline = [];
        this.duration = 0;
        return;
      }
      raws.sort((a, b) => a.absStart - b.absStart || a.absEnd - b.absEnd);
      // Walk in chronological order, compressing idle gaps into a tight timeline.
      const timeline: Entry[] = [];
      let cursor = 0;
      let prevAbsEnd = raws[0].absStart;
      for (const r of raws) {
        const gap = Math.min(Math.max(0, r.absStart - prevAbsEnd), GAP_CAP);
        const startTime = cursor + gap;
        const internal = Math.max(0, r.absEnd - r.absStart);
        const endTime =
          startTime + (r.kind === "stroke" ? Math.max(internal, MIN_STROKE_MS) : internal);
        timeline.push({
          kind: r.kind,
          id: r.id,
          stroke: r.stroke,
          shape: r.shape,
          image: r.image,
          startTime,
          endTime,
        });
        cursor = endTime;
        prevAbsEnd = r.absEnd;
      }
      this.timeline = timeline;
      this.duration = cursor + TAIL_MS;
    },
    // Build a timeline from a recorded event log. Baseline events (the content
    // that existed when recording began) collapse to t=0 and show instantly;
    // everything after is gap-compressed, with stroke-adds animated point-by-point.
    setupFromEvents(events: ReplayEvent[]) {
      const live = events.filter((e) => !e.baseline);
      const baseline = events.filter((e) => e.baseline);
      const timeline: Entry[] = [];
      for (const ev of baseline) {
        timeline.push({ kind: "stroke", id: "", event: ev.op, startTime: 0, endTime: 0 });
      }
      // Live edits start after a short hold so the baseline state is visible on
      // its own at t=0 rather than being immediately drawn over.
      let cursor = baseline.length > 0 ? BASELINE_HOLD_MS : 0;
      let prevT = live[0]?.t ?? 0;
      for (const ev of live) {
        const gap = Math.min(Math.max(0, ev.t - prevT), GAP_CAP);
        const startTime = cursor + gap;
        let endTime = startTime;
        if (ev.op.op === "stroke-add") {
          const dur = ev.op.stroke.points[ev.op.stroke.points.length - 1]?.t ?? 0;
          endTime = startTime + Math.max(dur, MIN_STROKE_MS);
        }
        timeline.push({ kind: "stroke", id: "", event: ev.op, startTime, endTime });
        cursor = endTime;
        prevT = ev.t;
      }
      this.timeline = timeline;
      this.duration = timeline.length > 0 ? cursor + TAIL_MS : 0;
    },
    start(content: ReplayContent) {
      this.setup(content);
      this.eventMode = false;
      this.active = true;
      this.time = 0;
      this.playing = false;
    },
    startEvents(events: ReplayEvent[]) {
      this.setupFromEvents(events);
      this.eventMode = true;
      this.active = true;
      this.time = 0;
      this.playing = false;
    },
    stop() {
      this.playing = false;
      this.active = false;
      this.eventMode = false;
      this.time = 0;
      this.timeline = [];
    },
    setTime(t: number) {
      this.time = Math.max(0, Math.min(t, this.duration));
    },
    setPlaying(v: boolean) {
      this.playing = v;
    },
    setSpeed(v: ReplaySpeed) {
      this.speed = v;
    },
  },
});
