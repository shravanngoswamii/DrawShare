import type { InputAdapter, InputHandlers, InputSample } from "@/core/ports";
import { dlog } from "@/debug";

// Persistent window-level pointer tracking. iPadOS Safari intermittently drops
// the pointerdown (and sometimes the pointerup) between rapid strokes; relying
// on per-stroke listeners attached in pointerdown therefore swallows alternate
// strokes. Instead we keep listeners alive for the adapter's lifetime and:
//   - recover a dropped pointerdown by beginning a stroke from the first
//     pressing pen pointermove (buttons > 0) when none is active;
//   - finalise a dropped pointerup on the next pointerdown.
export class PointerInputAdapter implements InputAdapter {
  private target: HTMLElement | undefined;
  private handlers: InputHandlers | undefined;
  private startTime = 0;
  private activeId: number | undefined;
  private penLockoutUntil = 0;
  private moveCount = 0;

  start(target: HTMLElement, handlers: InputHandlers): void {
    this.target = target;
    this.handlers = handlers;
    target.style.touchAction = "none";
    target.addEventListener("pointerdown", this.onDown, { passive: false });
    target.addEventListener("contextmenu", this.onContext);
    // Kill the native double-tap-zoom determination at the touch layer. iPadOS
    // ignores viewport zoom-disabling, and double-tapping the same spot (e.g.
    // writing a letter repeatedly) makes WebKit withhold the 2nd touch's
    // pointer events entirely — the alternate-stroke skip. preventing the touch
    // events cancels that; pointer events still fire for drawing.
    target.addEventListener("touchstart", this.onTouch, { passive: false });
    target.addEventListener("touchend", this.onTouch, { passive: false });
    window.addEventListener("pointermove", this.onMove, { passive: false });
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onCancel);
    window.addEventListener("blur", this.onBlur);
  }

  stop(): void {
    const t = this.target;
    if (!t) return;
    t.removeEventListener("pointerdown", this.onDown);
    t.removeEventListener("contextmenu", this.onContext);
    t.removeEventListener("touchstart", this.onTouch);
    t.removeEventListener("touchend", this.onTouch);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onCancel);
    window.removeEventListener("blur", this.onBlur);
    if (this.activeId !== undefined) this.handlers?.onUp();
    this.activeId = undefined;
    this.target = undefined;
    this.handlers = undefined;
  }

  private onContext = (e: Event) => e.preventDefault();

  // Only multi-touch (2+ fingers) is left to the browser/app pinch handler.
  private onTouch = (e: TouchEvent) => {
    if (e.cancelable && e.touches.length < 2) e.preventDefault();
  };

  private shouldIgnore(e: PointerEvent): boolean {
    if (e.pointerType !== "touch") return false;
    // Palm rejection is transient: only while the pen is in use (or just lifted)
    // do we ignore touches, so a resting palm can't draw. Once the pen has been
    // idle past the lockout, finger drawing works again — this is what lets you
    // draw with a finger on a pencil-capable iPad/iPhone.
    if (performance.now() < this.penLockoutUntil) return true;
    // A non-primary touch is the second finger of a pinch — left to pan/zoom.
    if (!e.isPrimary) return true;
    return false;
  }

  private toSample(e: PointerEvent): InputSample {
    const rect = this.target!.getBoundingClientRect();
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure,
      t: e.timeStamp - this.startTime,
      pointerType: e.pointerType as InputSample["pointerType"],
    };
  }

  private begin(e: PointerEvent): void {
    if (e.pointerType === "pen") {
      this.penLockoutUntil = performance.now() + 1500;
    }
    this.activeId = e.pointerId;
    this.startTime = e.timeStamp;
    this.moveCount = 0;
    this.handlers?.onDown(this.toSample(e));
  }

  private end(e?: PointerEvent, cancel = false): void {
    if (this.activeId === undefined) return;
    dlog(`END id${this.activeId} ${cancel ? "cancel" : "up"} moves=${this.moveCount}`);
    this.activeId = undefined;
    const sample = e ? this.toSample(e) : undefined;
    if (cancel) this.handlers?.onCancel(sample);
    else this.handlers?.onUp(sample);
  }

  private onDown = (e: PointerEvent) => {
    if (e.defaultPrevented) return dlog(`onDown SKIP defaultPrevented id${e.pointerId}`);
    if (this.shouldIgnore(e)) return dlog(`onDown SKIP ignore id${e.pointerId} ${e.pointerType}`);
    if (e.pointerType !== "touch" && e.button !== 0) return dlog(`onDown SKIP button${e.button}`);
    // Finalise a previous stroke whose pointerup iOS dropped.
    if (this.activeId !== undefined) this.end(e);
    e.preventDefault();
    dlog(`BEGIN via=down id${e.pointerId} ${e.pointerType}`);
    this.begin(e);
  };

  private onMove = (e: PointerEvent) => {
    // Recover a stroke whose pointerdown was dropped: a pressing pen move with
    // no matching active stroke starts (or transitions to) the stroke.
    if (e.pointerId !== this.activeId) {
      const penDown = e.pointerType === "pen" && (e.buttons > 0 || e.pressure > 0);
      if (!penDown || this.shouldIgnore(e)) return;
      // Only recover a dropped pointerdown when the pen is actually over the
      // canvas. The toolbar and side panel are overlay siblings of the canvas,
      // so a pen tap/drag on them fires a window pointermove with pressure > 0;
      // without this gate that starts a phantom stroke under the UI (and flips
      // isDrawing, which fades the toolbar mid-tap, making selection glitchy).
      if (!this.target || !(e.target instanceof Node) || !this.target.contains(e.target)) return;
      if (this.activeId !== undefined) this.end();
      dlog(`BEGIN via=move(recover) id${e.pointerId} b${e.buttons} p${e.pressure.toFixed(2)}`);
      this.begin(e);
    }
    if (this.shouldIgnore(e)) return;
    this.moveCount++;
    const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const list = coalesced.length > 0 ? coalesced : [e];
    this.handlers?.onMove(list.map((x) => this.toSample(x)));
    if (this.handlers?.onPredict) {
      const predicted = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      if (predicted.length > 0) this.handlers.onPredict(predicted.map((x) => this.toSample(x)));
    }
    if (e.pointerType === "pen") this.penLockoutUntil = performance.now() + 1500;
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId)
      return dlog(`onUp NOMATCH id${e.pointerId} active=${this.activeId}`);
    this.end(e);
  };

  private onCancel = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId)
      return dlog(`onCancel NOMATCH id${e.pointerId} active=${this.activeId}`);
    // Pen: commit what we have rather than discard a real stroke.
    this.end(e, e.pointerType !== "pen");
  };

  private onBlur = () => this.end();
}
