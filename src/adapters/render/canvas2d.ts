import { getStroke } from "perfect-freehand";
import type { Camera, Renderer } from "@/core/ports";
import type { PenType, Shape, Stroke, StrokePoint, TextItem } from "@/core/types";

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

// Per-type overrides on top of PEN_OPTIONS.
const PEN_TYPE_OPTIONS: Record<PenType, Partial<typeof PEN_OPTIONS>> = {
  // Ballpoint: existing well-tuned defaults, unchanged.
  ballpoint: {},
  // Brush: simulate pressure from speed so the stroke visibly thins on fast
  // movement even without a pressure-sensitive stylus. High thinning and a
  // long end taper give a dramatic calligraphic feel.
  brush: {
    thinning: 0.92,
    smoothing: 0.65,
    streamline: 0.45,
    simulatePressure: true,
    start: { taper: 10, cap: true },
    end: { taper: 80, cap: true },
  },
  // Marker: near-zero thinning and no taper produce a thick, completely flat
  // stroke regardless of speed or pressure.
  marker: {
    thinning: 0.02,
    smoothing: 0.4,
    streamline: 0.25,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
  },
};

// Effective stroke size multipliers — makes each type immediately distinct
// even at the same size-slider value.
const PEN_TYPE_SIZE_SCALE: Record<PenType, number> = {
  ballpoint: 1.0,
  brush: 1.4, // slightly wider for a full calligraphic range
  marker: 3.0, // bold and clearly chisel-like
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

  // Maps a stored ink color to the color actually painted (theme adaptation).
  // Identity by default; callers set this from the active theme. Stored stroke
  // data is never changed — only what gets drawn.
  private inkAdapt: (color: string) => string = (c) => c;

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

  setInkAdapter(fn: (color: string) => string): void {
    this.inkAdapt = fn;
    // Cached live-stroke pixels used the old adapter; force a rebuild.
    this.liveCacheCount = 0;
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

  setOrigin(dx: number, dy: number): void {
    if (!this.ctx) return;
    const { x, y, zoom } = this.camera;
    const s = this.dpr * zoom;
    this.ctx.setTransform(s, 0, 0, s, (-x + dx) * s, (-y + dy) * s);
  }

  pushClip(width: number, height: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
  }

  popClip(): void {
    this.ctx?.restore();
  }

  drawSheetBackground(
    width: number,
    height: number,
    background: "blank" | "ruled" | "grid" | "dotted",
    colors: { paper: string; line: string; dot: string },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, width, height);
    const spacing = 32;
    if (background === "ruled") {
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = spacing; y < height; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    } else if (background === "grid") {
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = spacing; x < width; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = spacing; y < height; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    } else if (background === "dotted") {
      ctx.fillStyle = colors.dot;
      for (let x = spacing; x < width; x += spacing) {
        for (let y = spacing; y < height; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawStroke(stroke: Stroke): void {
    if (!this.ctx || stroke.points.length === 0) return;
    this.renderToCtx(
      this.ctx,
      stroke.points,
      this.inkAdapt(stroke.color),
      stroke.opacity,
      stroke.size,
      true,
      stroke.penType,
    );
  }

  drawShape(shape: Shape): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = this.inkAdapt(shape.color);
    ctx.lineWidth = shape.size;
    ctx.globalAlpha = shape.opacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x1, y1, x2, y2 } = shape;
    ctx.beginPath();
    if (shape.type === "rect") {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (shape.type === "ellipse") {
      const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2,
        ry = Math.abs(y2 - y1) / 2;
      if (rx > 0 && ry > 0) ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else if (shape.type === "line") {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else if (shape.type === "arrow") {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(10, shape.size * 5);
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawText(item: TextItem): void {
    const ctx = this.ctx;
    if (!ctx || !item.text) return;
    ctx.save();
    ctx.fillStyle = this.inkAdapt(item.color);
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
    this.renderToCtx(
      ctx,
      pts.slice(tailFrom),
      this.inkAdapt(stroke.color),
      stroke.opacity,
      stroke.size,
      false,
      stroke.penType,
    );
  }

  private refreshLiveCache(stroke: Stroke, upToCount: number): void {
    if (!this.canvas) return;
    const { width: w, height: h } = this.canvas;

    if (!this.liveCache || this.liveCache.width !== w || this.liveCache.height !== h) {
      this.liveCache = new OffscreenCanvas(w, h);
      this.liveCacheCtx = this.liveCache.getContext(
        "2d",
      ) as OffscreenCanvasRenderingContext2D | null;
    }

    const ctx = this.liveCacheCtx;
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { x, y, zoom } = this.camera;
    const s = this.dpr * zoom;
    ctx.setTransform(s, 0, 0, s, -x * s, -y * s);

    this.renderToCtx(
      ctx,
      stroke.points.slice(0, upToCount),
      this.inkAdapt(stroke.color),
      stroke.opacity,
      stroke.size,
      false,
      stroke.penType,
    );
    this.liveCacheCount = upToCount;
  }

  private renderToCtx(
    ctx: DrawCtx,
    points: StrokePoint[],
    color: string,
    opacity: number,
    size: number,
    last: boolean,
    penType?: PenType,
  ): void {
    if (points.length === 0) return;

    const typeOverride = penType ? PEN_TYPE_OPTIONS[penType] : {};
    const sizeScale = penType ? PEN_TYPE_SIZE_SCALE[penType] : 1;
    const inputs = points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
    const path = getStroke(inputs, {
      ...PEN_OPTIONS,
      ...typeOverride,
      size: size * sizeScale,
      last,
    });
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
