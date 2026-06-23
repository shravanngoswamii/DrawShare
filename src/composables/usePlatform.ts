const ua = navigator.userAgent;

// iPadOS 13+ reports as "Macintosh"; touch support separates it from a real Mac.
export const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Third-party iOS browsers (Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS, Opera=OPiOS)
// all run on WebKit but, unlike Safari, never propagate the on-screen keyboard to
// the web layout, leaving a stuck gap at the bottom after it closes. The app can't
// fix this from JS/CSS, so we steer these users to Safari or an installed PWA.
export const isIOSNonSafari = (): boolean => isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

export const isStandalone = (): boolean =>
  (window.navigator as { standalone?: boolean }).standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;
