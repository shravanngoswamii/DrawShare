import { getStroke } from "perfect-freehand";
import type { Camera, Renderer } from "@/core/ports";
import type { Stroke, StrokePoint, TextItem } from "@/core/types";

type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const PEN_OPTIONS = {
  size: 1,
  thinning: 0.55,
  smoothing: 0.55,
  streamline: 0.32,
  easing: (t: number) => t,
  simulatePressure: false,
  start: { taper: 0, cap: true },
  end: { taper: 20, cap: true },
};

// perfect-freehand's smoothing window is ~12 points. Points before that
// threshold are stable and safe to cache. BATCH controls how many new stable
// points must accumulate before we pay the cost of re-rendering the cache.
const LIVE_LOOKAHEAD = 12;
const LIVE_BATCH = 8;

export class Canvas2DRenderer implements Renderer {
  private canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | undefined;
  private dpr = 1;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };

  // Incremental live-stroke cache: stores the "stable" prefix of the current
  // stroke rendered into an OffscreenCanvas so drawLive only computes the tail.
  private liveCache: OffscreenCanvas | null = null;
  private liveCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
  private liveCacheCount = 0;
  private liveCacheId = "";
  private liveCacheCam: Camera = { x: NaN, y: NaN, zoom: NaN };

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    // No `desynchronized`: on iOS its low-latency path drops draw ops under
    // rapid succession, which dropped alternate committed strokes.
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  setViewport(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.liveCacheCount = 0;
  }

  setCamera(cam: Camera): void {
    this.camera = cam;
  }

  clear(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  beginFrame(): void {
    if (!this.ctx) return;
    const { x, y, zoom } = this.camera;
    const s = this.dpr * zoom;
    this.ctx.setTransform(s, 0, 0, s, -x * s, -y * s);
  }

  endFrame(): void {
    /* noop */
  }

  drawStroke(stroke: Stroke): void {
    if (!this.ctx || stroke.points.length === 0) return;
    this.renderToCtx(this.ctx, stroke.points, stroke.color, stroke.opacity, stroke.size, true);
  }

  drawText(item: TextItem): void {
    const ctx = this.ctx;
    if (!ctx || !item.text) return;
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = `${item.size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    const lineHeight = item.size * 1.3;
    const lines = item.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], item.x, item.y + i * lineHeight);
    }
    ctx.restore();
  }

  drawLive(stroke: Stroke): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvas || stroke.points.length === 0) return;

    const cam = this.camera;
    const cameraChanged =
      cam.x !== this.liveCacheCam.x ||
      cam.y !== this.liveCacheCam.y ||
      cam.zoom !== this.liveCacheCam.zoom;

    if (stroke.id !== this.liveCacheId || cameraChanged) {
      this.liveCacheCount = 0;
      this.liveCacheId = stroke.id;
      this.liveCacheCam = { ...cam };
    }

    const pts = stroke.points;
    const stableEnd = Math.max(0, pts.length - LIVE_LOOKAHEAD);

    if (stableEnd > this.liveCacheCount + LIVE_BATCH) {
      this.refreshLiveCache(stroke, stableEnd);
    }

    if (this.liveCacheCount > 0 && this.liveCache) {
      // Blit cache (in screen space) then restore the world-space transform.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.liveCache, 0, 0);
      const s = this.dpr * cam.zoom;
      ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
    }

    // Render only the tail — overlap with cache is safe for opaque strokes;
    // for semi-transparent strokes the overlap region is small (~12 pts).
    const tailFrom = Math.max(0, this.liveCacheCount - LIVE_LOOKAHEAD);
    this.renderToCtx(ctx, pts.slice(tailFrom), stroke.color, stroke.opacity, stroke.size, false);
  }

  private refreshLiveCache(stroke: Stroke, upToCount: number): void {
    if (!this.canvas) return;
    const { width: w, height: h } = this.canvas;

    if (!this.liveCache || this.liveCache.width !== w || this.liveCache.height !== h) {
      this.liveCache = new OffscreenCanvas(w, h);
      this.liveCacheCtx = this.liveCache.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
    }

    const ctx = this.liveCacheCtx;
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { x, y, zoom } = this.camera;
    const s = this.dpr * zoom;
    ctx.setTransform(s, 0, 0, s, -x * s, -y * s);

    this.renderToCtx(ctx, stroke.points.slice(0, upToCount), stroke.color, stroke.opacity, stroke.size, false);
    this.liveCacheCount = upToCount;
  }

  private renderToCtx(
    ctx: DrawCtx,
    points: StrokePoint[],
    color: string,
    opacity: number,
    size: number,
    last: boolean,
  ): void {
    if (points.length === 0) return;

    const inputs = points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
    const path = getStroke(inputs, { ...PEN_OPTIONS, size, last });
    if (path.length === 0) return;

    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length - 1; i++) {
      const mx = (path[i][0] + path[i + 1][0]) / 2;
      const my = (path[i][1] + path[i + 1][1]) / 2;
      ctx.quadraticCurveTo(path[i][0], path[i][1], mx, my);
    }
    if (path.length > 1) {
      ctx.lineTo(path[path.length - 1][0], path[path.length - 1][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
