// Random friendly names for live viewers (e.g. "Calm Heron"), so the host can
// tell viewers apart and grant drawing to specific ones. Display-only; the
// stable per-viewer id is what routing actually uses.

const ADJECTIVES = [
  "Calm",
  "Bright",
  "Swift",
  "Brave",
  "Gentle",
  "Clever",
  "Sunny",
  "Cosmic",
  "Mellow",
  "Nimble",
  "Quiet",
  "Bold",
  "Lucky",
  "Merry",
  "Royal",
  "Amber",
  "Jolly",
  "Keen",
  "Plucky",
  "Witty",
];

const ANIMALS = [
  "Heron",
  "Otter",
  "Fox",
  "Lynx",
  "Falcon",
  "Panda",
  "Koala",
  "Robin",
  "Bison",
  "Hare",
  "Wren",
  "Tapir",
  "Gecko",
  "Moose",
  "Crane",
  "Ibex",
  "Quokka",
  "Badger",
  "Marten",
  "Puffin",
];

function pick(list: string[]): string {
  const i = crypto.getRandomValues(new Uint32Array(1))[0] % list.length;
  return list[i];
}

export function makeViewerName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
