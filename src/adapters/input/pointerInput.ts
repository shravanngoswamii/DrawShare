import type { InputAdapter, InputHandlers, InputSample } from "@/core/ports";

export class PointerInputAdapter implements InputAdapter {
  private target: HTMLElement | undefined;
  private handlers: InputHandlers | undefined;
  private startTime = 0;
  private penWasUsedRecently = false;
  private penLockoutUntil = 0;

  // Holds the teardown function for the in-progress stroke's window listeners.
  // Called at the start of every new pointerdown to guarantee the previous
  // stroke is committed even when iOS drops its pointerup.
  private pendingUp: ((ev?: PointerEvent) => void) | null = null;

  start(target: HTMLElement, handlers: InputHandlers): void {
    this.target = target;
    this.handlers = handlers;
    target.style.touchAction = "none";
    target.addEventListener("pointerdown", this.onDown, { passive: false });
    target.addEventListener("contextmenu", this.onContext);
  }

  stop(): void {
    const t = this.target;
    if (!t) return;
    t.removeEventListener("pointerdown", this.onDown);
    t.removeEventListener("contextmenu", this.onContext);
    this.pendingUp?.();
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
      t: performance.now() - this.startTime,
      pointerType: e.pointerType as InputSample["pointerType"],
    };
  }

  private onDown = (e: PointerEvent) => {
    if (e.defaultPrevented) return;
    if (this.shouldIgnore(e)) return;
    if (e.pointerType !== "touch" && e.button !== 0) return;

    // Force-commit any previous stroke whose pointerup was dropped by iOS.
    // This is the core of Excalidraw's approach: structural cleanup rather
    // than trying to filter stale events by ID or timestamp.
    this.pendingUp?.(e);

    e.preventDefault();

    if (e.pointerType === "pen") {
      this.penWasUsedRecently = true;
      this.penLockoutUntil = performance.now() + 1500;
    }

    this.startTime = performance.now();
    this.target?.setPointerCapture(e.pointerId);
    this.handlers?.onDown(this.toSample(e));

    const pointerId = e.pointerId;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (this.shouldIgnore(ev)) return;
      const events = typeof ev.getCoalescedEvents === "function" ? ev.getCoalescedEvents() : [];
      const list = events.length > 0 ? events : [ev];
      this.handlers?.onMove(list.map((x) => this.toSample(x)));
      if (this.handlers?.onPredict) {
        const predicted = typeof ev.getPredictedEvents === "function" ? ev.getPredictedEvents() : [];
        if (predicted.length > 0) {
          this.handlers.onPredict(predicted.map((x) => this.toSample(x)));
        }
      }
      if (ev.pointerType === "pen") {
        this.penLockoutUntil = performance.now() + 1500;
      }
    };

    const cleanup = () => {
      this.pendingUp = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
      this.target?.releasePointerCapture(pointerId);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      this.handlers?.onUp(this.toSample(ev));
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      if (e.pointerType === "pen") {
        this.handlers?.onUp(this.toSample(ev));
      } else {
        this.handlers?.onCancel(this.toSample(ev));
      }
    };

    // If the window loses focus (e.g. user switches app), commit the stroke.
    const onBlur = () => {
      cleanup();
      this.handlers?.onUp();
    };

    this.pendingUp = (ev) => {
      cleanup();
      this.handlers?.onUp(ev ? this.toSample(ev) : undefined);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
  };
}
