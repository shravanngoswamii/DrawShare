// Enabled by adding `?debug` to the URL. Used to mount the on-screen terminal
// and emit pointer diagnostics on devices where devtools aren't available.
export const DEBUG = typeof location !== "undefined" && /[?&]debug\b/.test(location.search);

export function dlog(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}
