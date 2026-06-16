import { ref } from "vue";

// Shared onboarding-tour state so the Help panel can replay it. `complete()`
// records the "seen" flag; `start()` (replay) deliberately leaves that flag
// untouched so replaying never changes future first-run behaviour.
const STORAGE_KEY = "drawshare-onboarding-done";

const visible = ref(false);
const step = ref(0);

function isDone(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function start(): void {
  step.value = 0;
  visible.value = true;
}

function complete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
  visible.value = false;
}

export function useOnboarding() {
  return { visible, step, isDone, start, complete };
}
