import type { InputAdapter, InputHandlers, InputSample } from "@/core/ports";

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
  private penWasUsedRecently = false;
  private penLockoutUntil = 0;

  start(target: HTMLElement, handlers: InputHandlers): void {
    this.target = target;
    this.handlers = handlers;
    target.style.touchAction = "none";
    target.addEventListener("pointerdown", this.onDown, { passive: false });
    target.addEventListener("contextmenu", this.onContext);
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

  private shouldIgnore(e: PointerEvent): boolean {
    if (e.pointerType !== "touch") return false;
    if (this.penWasUsedRecently || performance.now() < this.penLockoutUntil) return true;
    if (e.width > 25 || e.height > 25) return true;
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
      this.penWasUsedRecently = true;
      this.penLockoutUntil = performance.now() + 1500;
    }
    this.activeId = e.pointerId;
    this.startTime = e.timeStamp;
    this.handlers?.onDown(this.toSample(e));
  }

  private end(e?: PointerEvent, cancel = false): void {
    if (this.activeId === undefined) return;
    this.activeId = undefined;
    const sample = e ? this.toSample(e) : undefined;
    if (cancel) this.handlers?.onCancel(sample);
    else this.handlers?.onUp(sample);
  }

  private onDown = (e: PointerEvent) => {
    if (e.defaultPrevented) return;
    if (this.shouldIgnore(e)) return;
    if (e.pointerType !== "touch" && e.button !== 0) return;
    // Finalise a previous stroke whose pointerup iOS dropped.
    if (this.activeId !== undefined) this.end(e);
    e.preventDefault();
    this.begin(e);
  };

  private onMove = (e: PointerEvent) => {
    // Recover a stroke whose pointerdown was dropped: a pressing pen move with
    // no matching active stroke starts (or transitions to) the stroke.
    if (e.pointerId !== this.activeId) {
      const penDown = e.pointerType === "pen" && (e.buttons > 0 || e.pressure > 0);
      if (!penDown || this.shouldIgnore(e)) return;
      if (this.activeId !== undefined) this.end();
      this.begin(e);
    }
    if (this.shouldIgnore(e)) return;
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
    if (e.pointerId !== this.activeId) return;
    this.end(e);
  };

  private onCancel = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    // Pen: commit what we have rather than discard a real stroke.
    this.end(e, e.pointerType !== "pen");
  };

  private onBlur = () => this.end();
}
