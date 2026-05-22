// Lightweight signaling relay over ntfy.sh (free, no API key, CORS-enabled).
// Host publishes its WebRTC offer; viewer fetches it by session code, then
// publishes its answer so the host can auto-connect — no copy-pasting needed.

const BASE = "https://ntfy.sh";
const WINDOW_S = 300; // only look at messages from the last 5 minutes

function abortAfter(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function offerTopic(code: string): string {
  return `ds-${code.toUpperCase()}`;
}

function answerTopic(code: string): string {
  return `ds-${code.toUpperCase()}-a`;
}

export async function relayPublishOffer(code: string, token: string): Promise<void> {
  const resp = await fetch(`${BASE}/${offerTopic(code)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: token,
    signal: abortAfter(8_000),
  });
  if (resp.status === 413) throw new Error("Session data too large for relay.");
  if (!resp.ok) throw new Error(`Relay error: ${resp.status}`);
}

export async function relayFetchOffer(code: string): Promise<string | null> {
  const since = Math.floor(Date.now() / 1000) - WINDOW_S;
  const resp = await fetch(
    `${BASE}/${offerTopic(code)}/json?poll=1&since=${since}`,
    { signal: abortAfter(8_000) },
  ).catch(() => null);
  if (!resp || !resp.ok) return null;
  return parseLastMessage(await resp.text());
}

export async function relayPublishAnswer(code: string, token: string): Promise<void> {
  const resp = await fetch(`${BASE}/${answerTopic(code)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: token,
    signal: abortAfter(8_000),
  });
  if (!resp.ok) throw new Error(`Relay error: ${resp.status}`);
}

export async function relayFetchAnswer(code: string): Promise<string | null> {
  const since = Math.floor(Date.now() / 1000) - WINDOW_S;
  const resp = await fetch(
    `${BASE}/${answerTopic(code)}/json?poll=1&since=${since}`,
    { signal: abortAfter(5_000) },
  ).catch(() => null);
  if (!resp || !resp.ok) return null;
  return parseLastMessage(await resp.text());
}

function parseLastMessage(text: string): string | null {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (!lines.length) return null;
  try {
    const obj = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    return typeof obj.message === "string" ? obj.message : null;
  } catch {
    return null;
  }
}
