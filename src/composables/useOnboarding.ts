import introJs from "intro.js";
import "intro.js/introjs.css";
import "@/styles/introjs.css";

// intro.js-driven product tours. Two element-anchored tours: a short welcome on
// the projects screen and a feature walkthrough the first time a board opens.
// Each is gated by its own flag and can be replayed from the Help panel.

export type TourName = "projects" | "editor";

const FLAG = (name: TourName) => `drawshare-tour-${name}`;
// Honour the pre-intro.js flag so users who already saw the old tour aren't
// re-prompted; they can still replay from Help.
const LEGACY_FLAG = "drawshare-onboarding-done";

function hasSeen(name: TourName): boolean {
  try {
    return !!localStorage.getItem(FLAG(name)) || !!localStorage.getItem(LEGACY_FLAG);
  } catch {
    return false;
  }
}

function markSeen(name: TourName): void {
  try {
    localStorage.setItem(FLAG(name), "1");
  } catch {}
}

type Pos = "top" | "bottom" | "left" | "right";
interface Step {
  element?: HTMLElement;
  title: string;
  intro: string;
  position?: Pos;
}

function shown(el: Element | null): el is HTMLElement {
  // getClientRects() is truthy for rendered elements including position:fixed
  // (whose offsetParent is null), so it's a reliable "is visible" check here.
  return el instanceof HTMLElement && el.getClientRects().length > 0;
}

function find(tour: string): HTMLElement | null {
  const el = document.querySelector(`[data-tour="${tour}"]`);
  return shown(el) ? el : null;
}

function projectsSteps(): Step[] {
  const steps: Step[] = [
    {
      title: "Welcome to DrawShare 👋",
      intro:
        "A local-first whiteboard — draw, organise pages, and share live. Nothing leaves your device unless you start a session. Here's a quick tour.",
    },
  ];
  const newBtn = find("new-project");
  if (newBtn)
    steps.push({
      element: newBtn,
      position: "bottom",
      title: "Create a board",
      intro: "Start a new whiteboard here, then open it to draw — we'll show you around inside.",
    });
  const join = find("join");
  if (join)
    steps.push({
      element: join,
      position: "bottom",
      title: "Join a live session",
      intro: "Got a code from someone hosting? Enter it to watch their strokes appear live.",
    });
  const help = find("help");
  if (help)
    steps.push({
      element: help,
      position: "left",
      title: "Help & shortcuts",
      intro: "Keyboard shortcuts, FAQ, and a button to replay this tour all live here.",
    });
  return steps;
}

function editorSteps(): Step[] {
  const steps: Step[] = [];
  const toolbar = find("toolbar");
  if (toolbar)
    steps.push({
      element: toolbar,
      position: "right",
      title: "Your tools",
      intro:
        "Pen, highlighter, eraser, and text. Pick a pen style, then set size and colour as you draw.",
    });
  const pages = find("pages");
  if (pages)
    steps.push({
      element: pages,
      position: "left",
      title: "Pages & notebook",
      intro:
        "Add and switch pages here. Switch on Notebook mode for a scrollable stack of A4 sheets you can export as a PDF.",
    });
  const share = find("share");
  if (share)
    steps.push({
      element: share,
      position: "left",
      title: "Share live",
      intro: "Get a short code and let anyone watch every stroke the moment you draw it.",
    });
  if (steps.length === 0)
    steps.push({
      title: "You're in the editor",
      intro:
        "Draw with the tools on the left, manage pages on the right, and share live from the panel.",
    });
  return steps;
}

function run(name: TourName) {
  const steps = name === "projects" ? projectsSteps() : editorSteps();
  introJs
    .tour()
    .setOptions({
      steps,
      tooltipClass: "ds-introjs",
      showBullets: steps.length > 1,
      showProgress: false,
      exitOnOverlayClick: false,
      exitOnEsc: true,
      disableInteraction: true,
      scrollToElement: true,
      // Keep the tooltip beside its element but let intro.js flip to whatever
      // side fits — on a narrow phone "right"/"left" rarely fit, so it falls
      // back to below/above instead of overflowing off-screen.
      autoPosition: true,
      positionPrecedence: ["bottom", "top", "right", "left"],
      overlayOpacity: 0.5,
      nextLabel: "Next",
      prevLabel: "Back",
      doneLabel: "Done",
    })
    .onComplete(() => markSeen(name))
    .onExit(() => markSeen(name))
    .start();
}

export function useOnboarding() {
  // Auto-start on first visit. requestAnimationFrame lets the anchored elements
  // paint before intro.js measures them.
  function maybeStart(name: TourName, delayMs = 0) {
    if (hasSeen(name)) return;
    if (delayMs > 0) setTimeout(() => requestAnimationFrame(() => run(name)), delayMs);
    else requestAnimationFrame(() => run(name));
  }
  function replay(name: TourName) {
    run(name);
  }
  return { maybeStart, replay, hasSeen };
}
