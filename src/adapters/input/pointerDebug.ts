import { DEBUG, dlog } from "@/debug";

// Raw, capture-phase window probe: logs every pointerdown/up/cancel the device
// actually delivers (independent of our adapter), so we can tell whether iPadOS
// dropped an event vs. our logic mishandled it. Logs flow into DebugConsole.
export function installPointerProbe(): (() => void) | undefined {
  if (!DEBUG) return;
  let lastT = 0;
  const fmt = (tag: string, e: PointerEvent) => {
    const dt = lastT ? Math.round(e.timeStamp - lastT) : 0;
    lastT = e.timeStamp;
    return `RAW ${tag} id${e.pointerId} ${e.pointerType} b${e.buttons} p${e.pressure.toFixed(2)} Δ${dt}ms`;
  };
  const onDown = (e: PointerEvent) => dlog(fmt("down", e));
  const onUp = (e: PointerEvent) => dlog(fmt("up", e));
  const onCancel = (e: PointerEvent) => dlog(fmt("cancel", e));

  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", onDown, opts);
  window.addEventListener("pointerup", onUp, opts);
  window.addEventListener("pointercancel", onCancel, opts);

  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
  };
}
