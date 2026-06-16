import type { Shape } from "./types";

// The outline of a shape as a list of [ax, ay, bx, by] line segments (shape-local
// coords). rect → 4 edges; line → one segment; arrow → shaft + the two head
// strokes; ellipse → a sampled polygon. Shared by the eraser's hit-test (whole
// mode) and its segment clipping (area mode).
export function shapeSegments(s: Shape): Array<[number, number, number, number]> {
  const { x1, y1, x2, y2 } = s;
  if (s.type === "line") return [[x1, y1, x2, y2]];
  if (s.type === "arrow") {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, s.size * 5);
    const hlx = x2 - headLen * Math.cos(angle - Math.PI / 6);
    const hly = y2 - headLen * Math.sin(angle - Math.PI / 6);
    const hrx = x2 - headLen * Math.cos(angle + Math.PI / 6);
    const hry = y2 - headLen * Math.sin(angle + Math.PI / 6);
    return [
      [x1, y1, x2, y2],
      [x2, y2, hlx, hly],
      [x2, y2, hrx, hry],
    ];
  }
  if (s.type === "rect") {
    const a = Math.min(x1, x2);
    const b = Math.max(x1, x2);
    const c = Math.min(y1, y2);
    const d = Math.max(y1, y2);
    return [
      [a, c, b, c],
      [b, c, b, d],
      [b, d, a, d],
      [a, d, a, c],
    ];
  }
  // ellipse
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  const segs: Array<[number, number, number, number]> = [];
  const N = 64;
  let px = cx + rx;
  let py = cy;
  for (let i = 1; i <= N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const nx = cx + rx * Math.cos(ang);
    const ny = cy + ry * Math.sin(ang);
    segs.push([px, py, nx, ny]);
    px = nx;
    py = ny;
  }
  return segs;
}
