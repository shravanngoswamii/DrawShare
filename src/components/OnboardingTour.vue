<script setup lang="ts">
import { ref } from "vue";

const STORAGE_KEY = "drawshare-onboarding-done";

function isDone(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}

const visible = ref(!isDone());
const step = ref(0);

const steps = [
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    title: "Welcome to DrawShare",
    body: "A local-first whiteboard that streams your live writing to any screen on your network — no account needed, your data stays on your device.",
  },
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01"/></svg>`,
    title: "Draw on the canvas",
    body: "Pick a pen, highlighter, eraser, or text tool from the toolbar. Adjust size and colour in the sidebar. Pan with two fingers or Space + drag; pinch to zoom.",
  },
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>`,
    title: "Organise with pages",
    body: "Open the pages panel to add, reorder, or rename pages. Each project can hold as many pages as you need — great for long notes or multi-part lessons.",
  },
  {
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
    title: "Share live with anyone nearby",
    body: "Tap the share button in the editor to get a short code. Anyone on the same network can open DrawShare and join — they see every stroke the moment you draw it.",
  },
];

function next() {
  if (step.value < steps.length - 1) {
    step.value++;
  } else {
    dismiss();
  }
}

function dismiss() {
  markDone();
  visible.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="backdrop" role="dialog" aria-modal="true" aria-label="Welcome tour" @click.self="dismiss">
      <div class="modal">
        <button class="skip" @click="dismiss" aria-label="Skip tour">Skip</button>

        <div class="step-icon" aria-hidden="true" v-html="steps[step].icon" />

        <h2 class="step-title">{{ steps[step].title }}</h2>
        <p class="step-body">{{ steps[step].body }}</p>

        <div class="dots" aria-label="Step indicators" role="list">
          <button
            v-for="(_, i) in steps"
            :key="i"
            class="dot"
            :class="{ active: i === step }"
            :aria-label="`Go to step ${i + 1}`"
            :aria-current="i === step ? 'step' : undefined"
            @click="step = i"
          />
        </div>

        <div class="actions">
          <button v-if="step > 0" class="btn btn-ghost" @click="step--">Back</button>
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

.dots {
  display: flex;
  gap: var(--space-2);
  margin: var(--space-2) 0;
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

/* reuse base button styles */
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
</style>
