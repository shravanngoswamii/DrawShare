import { ref } from "vue";

// Dev Mode: toggled from the navbar, persisted across reloads. When on, the
// editor mounts the on-screen terminal and the raw pointer probe so issues can
// be diagnosed on devices without devtools (iPad).
const KEY = "drawshare:devmode";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const devMode = ref(load());

export function setDevMode(on: boolean): void {
  devMode.value = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function dlog(...args: unknown[]): void {
  if (devMode.value) console.log(...args);
}
