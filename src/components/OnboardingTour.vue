<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useOnboarding } from "@/composables/useOnboarding";

const { visible, step, isDone, start, complete } = useOnboarding();

const steps = [
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    title: "Welcome to DrawShare",
    body: "A local-first whiteboard that streams your live writing to any screen — no account needed, and your data stays on your device.",
  },
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01"/></svg>`,
    title: "Draw on the canvas",
    body: "Pick a pen, highlighter, eraser, or text tool from the toolbar. Adjust size and colour in the sidebar. Pan with two fingers or Space + drag; pinch to zoom.",
  },
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>`,
    title: "Organise with pages",
    body: "Open the pages panel to add, rename, or switch pages. Turn on Notebook mode for a scrollable stack of A4 sheets you can export as a PDF.",
  },
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
    title: "Share live with anyone",
    body: "Tap Share in the editor to get a short code. Send it to anyone and they can watch every stroke the moment you draw it — over Wi-Fi or hotspot, with a same-network fallback when needed.",
  },
];

const modalRef = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

function next() {
  if (step.value < steps.length - 1) step.value++;
  else dismiss();
}

function prev() {
  if (step.value > 0) step.value--;
}

function dismiss() {
  complete();
}

function focusables(): HTMLElement[] {
  if (!modalRef.value) return [];
  return Array.from(
    modalRef.value.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute("disabled"));
}

function onKeydown(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dismiss();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    next();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    prev();
  } else if (e.key === "Tab") {
    const f = focusables();
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

const appEl = () => document.getElementById("app");

// Open/close side effects: trap focus, make the page behind inert + scroll-locked,
// and restore everything on close. The modal is teleported to <body> (outside
// #app), so marking #app inert disables the background without affecting it.
watch(visible, (v) => {
  if (v) {
    lastFocused = document.activeElement as HTMLElement | null;
    appEl()?.setAttribute("inert", "");
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeydown);
    nextTick(() => modalRef.value?.querySelector<HTMLElement>(".btn-primary")?.focus());
  } else {
    appEl()?.removeAttribute("inert");
    document.documentElement.style.overflow = "";
    window.removeEventListener("keydown", onKeydown);
    lastFocused?.focus?.();
    lastFocused = null;
  }
});

onMounted(() => {
  if (!isDone()) start();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  appEl()?.removeAttribute("inert");
  document.documentElement.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ob-title"
      @click.self="dismiss"
    >
      <div ref="modalRef" class="modal" tabindex="-1">
        <button class="skip" @click="dismiss" aria-label="Skip tour">Skip</button>

        <Transition name="step" mode="out-in">
          <div :key="step" class="step-content">
            <div class="step-icon" aria-hidden="true" v-html="steps[step].icon" />
            <h2 id="ob-title" class="step-title">{{ steps[step].title }}</h2>
            <p class="step-body">{{ steps[step].body }}</p>
          </div>
        </Transition>

        <div class="progress" aria-hidden="true">Step {{ step + 1 }} of {{ steps.length }}</div>

        <div class="dots" aria-label="Step indicators" role="list">
          <button
            v-for="(s, i) in steps"
            :key="s.title"
            class="dot"
            :class="{ active: i === step }"
            :aria-label="`Go to step ${i + 1}: ${s.title}`"
            :aria-current="i === step ? 'step' : undefined"
            @click="step = i"
          />
        </div>

        <div class="actions">
          <button v-if="step > 0" class="btn btn-ghost" @click="prev">Back</button>
          <button class="btn btn-primary" @click="next">
            {{ step < steps.length - 1 ? "Next" : "Get started" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  backdrop-filter: blur(2px);
  animation: ob-fade 160ms ease;
}

.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 420px;
  padding: var(--space-8) var(--space-8) var(--space-6);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  outline: none;
  animation: ob-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes ob-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes ob-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.skip {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  line-height: 1;
}

.skip:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.step-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

/* Step-to-step crossfade (disabled under reduced-motion below). */
.step-enter-active,
.step-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.step-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-2);
}

.step-title {
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text);
  margin: 0;
}

.step-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
  max-width: 340px;
}

.progress {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.dots {
  display: flex;
  gap: var(--space-2);
  margin: var(--space-1) 0 var(--space-2);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 150ms ease, width 150ms ease;
}

.dot.active {
  background: var(--color-accent);
  width: 18px;
}

.actions {
  display: flex;
  gap: var(--space-2);
  width: 100%;
  margin-top: var(--space-2);
}

.actions .btn {
  flex: 1;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  white-space: nowrap;
  user-select: none;
}

.btn-primary {
  background: var(--color-accent);
  color: var(--color-accent-text);
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text);
  border-color: var(--color-border);
}

.btn-ghost:hover {
  background: var(--color-surface-2);
}

@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .modal {
    animation: none;
  }
  .step-enter-active,
  .step-leave-active {
    transition: none;
  }
  .step-enter-from,
  .step-leave-to {
    transform: none;
  }
}
</style>
