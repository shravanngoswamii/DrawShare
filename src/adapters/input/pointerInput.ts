import type { InputAdapter, InputHandlers, InputSample } from "@/core/ports";

export class PointerInputAdapter implements InputAdapter {
  private target: HTMLElement | undefined;
  private handlers: InputHandlers | undefined;
  private activePointerId: number | undefined;
  private startTime = 0;
  private penWasUsedRecently = false;
  private penLockoutUntil = 0;
  private strokeStartStamp = -1;

  start(target: HTMLElement, handlers: InputHandlers): void {
    this.target = target;
    this.handlers = handlers;
    target.style.touchAction = "none";
    target.addEventListener("pointerdown", this.onDown, { passive: false });
    target.addEventListener("pointermove", this.onMove, { passive: false });
    target.addEventListener("pointerup", this.onUp, { passive: false });
    target.addEventListener("pointercancel", this.onCancel, { passive: false });
    target.addEventListener("contextmenu", this.onContext);
  }

  stop(): void {
    const t = this.target;
    if (!t) return;
    t.removeEventListener("pointerdown", this.onDown);
    t.removeEventListener("pointermove", this.onMove);
    t.removeEventListener("pointerup", this.onUp);
    t.removeEventListener("pointercancel", this.onCancel);
    t.removeEventListener("contextmenu", this.onContext);
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
    const pressure = e.pressure > 0 ? e.pressure : e.pointerType === "pen" ? 0.5 : 0.5;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure,
      t: performance.now() - this.startTime,
      pointerType: e.pointerType as InputSample["pointerType"],
    };
  }

  private onDown = (e: PointerEvent) => {
    if (e.defaultPrevented) return;
    if (this.shouldIgnore(e)) return;
    if (e.pointerType !== "touch" && e.button !== 0) return;
    if (this.activePointerId !== undefined) {
      this.target?.releasePointerCapture(this.activePointerId);
      this.activePointerId = undefined;
      this.handlers?.onUp();
    }
    e.preventDefault();
    if (e.pointerType === "pen") {
      this.penWasUsedRecently = true;
      this.penLockoutUntil = performance.now() + 1500;
    }
    this.activePointerId = e.pointerId;
    this.strokeStartStamp = e.timeStamp;
    this.startTime = performance.now();
    this.target?.setPointerCapture(e.pointerId);
    this.handlers?.onDown(this.toSample(e));
  };

  private onMove = (e: PointerEvent) => {
    if (e.defaultPrevented) return;
    if (this.activePointerId !== e.pointerId) return;
    if (this.shouldIgnore(e)) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const list = events.length > 0 ? events : [e];
    const samples = list.map((ev) => this.toSample(ev));
    this.handlers?.onMove(samples);
    if (this.handlers?.onPredict) {
      const predicted = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      if (predicted.length > 0) {
        this.handlers.onPredict(predicted.map((ev) => this.toSample(ev)));
      }
    }
    if (e.pointerType === "pen") {
      this.penLockoutUntil = performance.now() + 1500;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.defaultPrevented) return;
    if (this.activePointerId !== e.pointerId) return;
    e.preventDefault();
    this.target?.releasePointerCapture(e.pointerId);
    this.activePointerId = undefined;
    this.handlers?.onUp();
  };

  private onCancel = (e: PointerEvent) => {
    if (this.activePointerId !== e.pointerId) return;
    if (e.timeStamp <= this.strokeStartStamp) return;
    this.target?.releasePointerCapture(e.pointerId);
    this.activePointerId = undefined;
    if (e.pointerType === "pen") {
      this.handlers?.onUp();
    } else {
      this.handlers?.onCancel();
    }
  };
}
