/// <reference types="@cloudflare/workers-types" />

// DrawShare live-session relay.
//
// One Durable Object per session code. It fans out messages between the host
// and its viewers over WebSocket — host -> viewers, viewer -> host. It stores
// nothing (purely a live relay) and uses the WebSocket Hibernation API, so an
// idle room costs no compute.
//
// Security model: there are no secrets in this worker and none in the repo.
// The session code in the URL is the only access control — anyone who has the
// code can join that room, so treat a code like a shared password and only
// hand it to people you want in the session. Data is ephemeral and never
// persisted. An Origin allowlist (ALLOWED_ORIGINS) keeps other websites from
// driving up usage on your relay from a browser; it is a cost guard, not a
// substitute for the session code.

interface Env {
  LIVE_ROOM: DurableObjectNamespace;
  // Comma-separated list of allowed browser origins, e.g.
  // "https://shravangoswami.com". Leave empty to allow any origin (a fork that
  // has not configured this still works). localhost is always allowed for dev.
  ALLOWED_ORIGINS?: string;
}

// Per-room socket cap (host + viewers). A backstop against a single code being
// used to pile up connections; comfortably above any real classroom session.
const MAX_SOCKETS_PER_ROOM = 64;

function isAllowedOrigin(origin: string | null, allowList: string): boolean {
  const allowed = allowList
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  // No allowlist configured: open relay (still gated by the session code).
  if (allowed.length === 0) return true;
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  // Always allow local development origins.
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{1,32})$/);
    if (!match) return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (!isAllowedOrigin(request.headers.get("Origin"), env.ALLOWED_ORIGINS ?? "")) {
      return new Response("Forbidden origin", { status: 403 });
    }
    const id = env.LIVE_ROOM.idFromName(match[1].toUpperCase());
    return env.LIVE_ROOM.get(id).fetch(request);
  },
};

// Relay-control frames (distinct from app messages, which carry a `t` field).
type RelayFrame = { __relay: "viewer-join" | "viewer-leave" | "host-left" };

export class LiveRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (this.state.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      return new Response("Room is full", { status: 503 });
    }
    const role = new URL(request.url).searchParams.get("role") === "host" ? "host" : "viewer";
    const { 0: client, 1: server } = new WebSocketPair();
    // Tag the socket with its role; the Hibernation API restores tags after an
    // idle period, so routing needs no in-memory connection list.
    this.state.acceptWebSocket(server, [role]);
    if (role === "viewer") this.send("host", { __relay: "viewer-join" });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const isHost = this.state.getTags(ws).includes("host");
    // Forward to the other side: a host's strokes go to viewers; anything a
    // viewer sends goes to the host(s).
    for (const target of this.state.getWebSockets(isHost ? "viewer" : "host")) {
      try {
        target.send(message);
      } catch {
        /* socket closing; skip */
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    const isHost = this.state.getTags(ws).includes("host");
    this.send(isHost ? "viewer" : "host", { __relay: isHost ? "host-left" : "viewer-leave" });
  }

  webSocketError(): void {}

  private send(tag: "host" | "viewer", frame: RelayFrame): void {
    const data = JSON.stringify(frame);
    for (const target of this.state.getWebSockets(tag)) {
      try {
        target.send(data);
      } catch {
        /* socket closing; skip */
      }
    }
  }
}
