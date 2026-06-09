import { defineStore } from "pinia";
import type { Stroke } from "@/core/types";

export type ReplaySpeed = 0.5 | 1 | 2;

interface ReplayEntry {
  stroke: Stroke;
  startTime: number; // ms from drawing origin
  endTime: number;
}

export const useReplayStore = defineStore("replay", {
  state: () => ({
    active: false,
    playing: false,
    speed: 1 as ReplaySpeed,
    time: 0, // current position ms
    duration: 0, // total duration ms
    timeline: [] as ReplayEntry[],
  }),
  getters: {
    progress(state): number {
      return state.duration > 0 ? state.time / state.duration : 0;
    },
    displayStrokes(state): Stroke[] {
      if (!state.active) return [];
      const t = state.time;
      const result: Stroke[] = [];
      for (const entry of state.timeline) {
        if (entry.startTime > t) continue;
        if (entry.endTime <= t) {
          result.push(entry.stroke);
        } else {
          const pct = (t - entry.startTime) / Math.max(1, entry.endTime - entry.startTime);
          const nPts = Math.max(2, Math.ceil(entry.stroke.points.length * pct));
          result.push({ ...entry.stroke, points: entry.stroke.points.slice(0, nPts) });
        }
      }
      return result;
    },
  },
  actions: {
    setup(strokes: Stroke[]) {
      const sorted = [...strokes].sort((a, b) => a.createdAt - b.createdAt);
      if (sorted.length === 0) {
        this.timeline = [];
        this.duration = 0;
        return;
      }
      const entries = sorted.map((stroke) => {
        const lastPt = stroke.points[stroke.points.length - 1];
        const dur = lastPt?.t ?? 0;
        return { stroke, absStart: stroke.createdAt - dur, absEnd: stroke.createdAt };
      });
      const origin = Math.min(...entries.map((e) => e.absStart));
      this.timeline = entries.map((e) => ({
        stroke: e.stroke,
        startTime: Math.max(0, e.absStart - origin),
        endTime: Math.max(e.absEnd - origin, e.absStart - origin + 50),
      }));
      this.duration = Math.max(...this.timeline.map((e) => e.endTime)) + 500;
    },
    start(strokes: Stroke[]) {
      this.setup(strokes);
      this.active = true;
      this.time = 0;
      this.playing = false;
    },
    stop() {
      this.playing = false;
      this.active = false;
      this.time = 0;
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
