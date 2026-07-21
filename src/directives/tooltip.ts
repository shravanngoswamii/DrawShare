import type { Directive, DirectiveBinding } from "vue";

// A small, instant, theme-aware tooltip — replaces the browser's native `title`
// (slow to appear, unstyled, ignores the page's own theme). One shared DOM node
// outside Vue's render tree (like a native tooltip would be), so showing it is
// just a class toggle, not a component mount.

const textByEl = new WeakMap<HTMLElement, string>();
const cleanupByEl = new WeakMap<HTMLElement, () => void>();

let tooltipEl: HTMLDivElement | null = null;
let activeTarget: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

const SHOW_DELAY = 50;
const HIDE_DELAY = 60;
const VIEWPORT_MARGIN = 8;
const TARGET_GAP = 8;

function ensureEl(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "app-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function place(el: HTMLDivElement, target: HTMLElement) {
  const r = target.getBoundingClientRect();
  const tw = el.offsetWidth;
  const th = el.offsetHeight;

  let top = r.top - th - TARGET_GAP;
  if (top < VIEWPORT_MARGIN) top = r.bottom + TARGET_GAP;

  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - tw - VIEWPORT_MARGIN));

  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

function show(target: HTMLElement) {
  const text = textByEl.get(target);
  if (!text) return;
  clearTimeout(hideTimer);
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    activeTarget = target;
    const el = ensureEl();
    el.textContent = text;
    el.classList.add("is-visible");
    place(el, target);
  }, SHOW_DELAY);
}

function hide(target: HTMLElement) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (activeTarget !== target) return;
    tooltipEl?.classList.remove("is-visible");
    activeTarget = null;
  }, HIDE_DELAY);
}

function updateBinding(el: HTMLElement, binding: DirectiveBinding<string | null | undefined>) {
  if (binding.value) textByEl.set(el, binding.value);
  else textByEl.delete(el);
}

export const vTooltip: Directive<HTMLElement, string | null | undefined> = {
  mounted(el, binding) {
    updateBinding(el, binding);
    const onEnter = () => show(el);
    const onLeave = () => hide(el);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("focus", onEnter);
    el.addEventListener("blur", onLeave);
    cleanupByEl.set(el, () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
  },
  updated(el, binding) {
    updateBinding(el, binding);
  },
  unmounted(el) {
    cleanupByEl.get(el)?.();
    cleanupByEl.delete(el);
    textByEl.delete(el);
    if (activeTarget === el) {
      tooltipEl?.classList.remove("is-visible");
      activeTarget = null;
    }
  },
};
