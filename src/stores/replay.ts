import { defineStore } from "pinia";
import type { ImageItem, Page, Shape, Stroke } from "@/core/types";

export type ReplaySpeed = 0.5 | 1 | 2;

// Longest real-world idle gap (ms) kept between consecutive items. Pauses longer
// than this are compressed so replay doesn't sit on dead air for minutes.
const GAP_CAP = 700;
// Minimum on-screen window (ms) for an animated stroke so partial reveal is visible.
const MIN_STROKE_MS = 60;
// Tail padding (ms) after the last item so replay ends on the finished drawing.
const TAIL_MS = 500;

type Kind = "stroke" | "shape" | "image" | "text";

interface Entry {
  kind: Kind;
  id: string;
  stroke?: Stroke;
  shape?: Shape;
  image?: ImageItem;
  startTime: number;
  endTime: number;
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
  }),
  getters: {
    progress(state): number {
      return state.duration > 0 ? state.time / state.duration : 0;
    },
    // Strokes revealed at the current time — fully drawn (endTime ≤ t) or sliced
    // proportionally while in their draw window.
    displayStrokes(state): Stroke[] {
      if (!state.active) return [];
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
      const out: Shape[] = [];
      for (const e of state.timeline) {
        if (e.kind === "shape" && e.shape && e.startTime <= state.time) out.push(e.shape);
      }
      return out;
    },
    displayImages(state): ImageItem[] {
      if (!state.active) return [];
      const out: ImageItem[] = [];
      for (const e of state.timeline) {
        if (e.kind === "image" && e.image && e.startTime <= state.time) out.push(e.image);
      }
      return out;
    },
    // Text ids revealed so far — render filters page.texts against this set.
    displayTextIds(state): Set<string> {
      const ids = new Set<string>();
      if (!state.active) return ids;
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
    start(content: ReplayContent) {
      this.setup(content);
      this.active = true;
      this.time = 0;
      this.playing = false;
    },
    stop() {
      this.playing = false;
      this.active = false;
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
