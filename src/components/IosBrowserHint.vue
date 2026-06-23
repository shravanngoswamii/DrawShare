<script setup lang="ts">
import { ref } from "vue";
import { isIOSNonSafari, isStandalone } from "@/composables/usePlatform";

const DISMISS_KEY = "ds-ios-browser-hint-dismissed";

const show = ref(isIOSNonSafari() && !isStandalone() && localStorage.getItem(DISMISS_KEY) !== "1");
const expanded = ref(false);

function dismiss() {
  show.value = false;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // private mode: just hide for this session
  }
}
</script>

<template>
  <div v-if="show" class="ios-hint" role="status">
    <div class="ios-hint-main">
      <p class="ios-hint-text">
        Chrome on iPad has a keyboard bug that can leave a gap at the bottom of the
        screen. For the smoothest experience, use <strong>Safari</strong> or add
        DrawShare to your <strong>Home Screen</strong>.
      </p>
      <button class="ios-hint-how" @click="expanded = !expanded">
        {{ expanded ? "Hide steps" : "How to add" }}
      </button>
      <ol v-if="expanded" class="ios-hint-steps">
        <li>Open this page in <strong>Safari</strong>.</li>
        <li>Tap the <strong>Share</strong> button.</li>
        <li>Choose <strong>Add to Home Screen</strong>.</li>
      </ol>
    </div>
    <button class="ios-hint-close" @click="dismiss" aria-label="Dismiss">
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.ios-hint {
  position: fixed;
  left: 50%;
  bottom: calc(var(--space-4) + var(--safe-bottom));
  transform: translateX(-50%);
  z-index: 80;
  width: min(420px, calc(100vw - var(--space-4) * 2));
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: ios-hint-in 200ms ease;
}

@keyframes ios-hint-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.ios-hint-main {
  flex: 1;
  min-width: 0;
}

.ios-hint-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--color-text);
}

.ios-hint-how {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
  text-decoration: underline;
}

.ios-hint-steps {
  margin: var(--space-2) 0 0;
  padding-left: 1.2em;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.ios-hint-steps li {
  margin: 2px 0;
}

.ios-hint-close {
  flex-shrink: 0;
  align-self: flex-start;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}

.ios-hint-close:hover {
  background: var(--color-surface-2);
}
</style>
