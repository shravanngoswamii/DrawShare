import { dlog } from "@/debug";

// Raw, capture-phase window probe: logs every pointerdown/up/cancel the device
// actually delivers (independent of our adapter), so we can tell whether iPadOS
// dropped an event vs. our logic mishandled it. Logs flow into DebugConsole.
export function installPointerProbe(): () => void {
  let lastT = 0;
  const targetOf = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t?.tagName) return "?";
    const cls = typeof t.className === "string" ? t.className.split(" ")[0] : "";
    return t.tagName.toLowerCase() + (cls ? `.${cls}` : "");
  };
  const fmt = (tag: string, e: PointerEvent, withTarget = false) => {
    const dt = lastT ? Math.round(e.timeStamp - lastT) : 0;
    lastT = e.timeStamp;
    return (
      `RAW ${tag} id${e.pointerId} ${e.pointerType} prim${e.isPrimary ? 1 : 0} ` +
      `b${e.buttons} p${e.pressure.toFixed(2)} w${Math.round(e.width)} h${Math.round(e.height)} ` +
      `Δ${dt}ms${withTarget ? ` →${targetOf(e)}` : ""}`
    );
  };
  const onDown = (e: PointerEvent) => dlog(fmt("down", e, true));
  const onUp = (e: PointerEvent) => dlog(fmt("up", e));
  const onCancel = (e: PointerEvent) => dlog(fmt("cancel", e));

  // First move of each contact only, to confirm moves arrive without flooding.
  const moveSeen = new Set<number>();
  const onMove = (e: PointerEvent) => {
    if (moveSeen.has(e.pointerId)) return;
    moveSeen.add(e.pointerId);
    if (moveSeen.size > 50) moveSeen.clear();
    dlog(fmt("move1", e));
  };

  // Raw touch events: if a skipped stroke fires touchstart but no pointerdown,
  // WebKit is withholding pointer events (double-tap gesture) — confirms the
  // touch layer is where to intervene.
  const onTouchStart = (e: TouchEvent) =>
    dlog(`RAW touchstart n${e.touches.length} →${targetOf(e)}`);
  const onTouchEnd = (e: TouchEvent) => dlog(`RAW touchend n${e.touches.length}`);

  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", onDown, opts);
  window.addEventListener("pointermove", onMove, opts);
  window.addEventListener("pointerup", onUp, opts);
  window.addEventListener("pointercancel", onCancel, opts);
  window.addEventListener("touchstart", onTouchStart, opts);
  window.addEventListener("touchend", onTouchEnd, opts);

  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("touchstart", onTouchStart, true);
    window.removeEventListener("touchend", onTouchEnd, true);
  };
}
