/// <reference types="@cloudflare/workers-types" />

// DrawShare live-session relay.
//
// One Durable Object per session code. It fans out messages between the host
// and its viewers over WebSocket — host -> viewers, viewer -> host. It stores
// nothing (purely a live relay) and uses the WebSocket Hibernation API, so an
// idle room costs no compute.
//
// Each viewer has an id and a display name (sent as query params on connect),
// so the host can address one viewer in particular — used to grant drawing
// permission to specific viewers. A host message whose JSON begins with a
// `__to` field is routed to just that viewer; every other host message is
// broadcast to all viewers.
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
type RelayFrame =
  | { __relay: "viewer-join"; id: string; name: string }
  | { __relay: "viewer-leave"; id: string }
  | { __relay: "host-left" };

// Per-viewer identity carried on the socket (survives hibernation).
interface ViewerInfo {
  vid: string;
  name: string;
}

function sanitizeId(raw: string | null): string {
  return (raw ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function sanitizeName(raw: string | null): string {
  // Strip control chars and cap the length; names are display-only.
  return (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 40);
}

export class LiveRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (this.state.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      return new Response("Room is full", { status: 503 });
    }
    const params = new URL(request.url).searchParams;
    const role = params.get("role") === "host" ? "host" : "viewer";
    const { 0: client, 1: server } = new WebSocketPair();

    if (role === "viewer") {
      const info: ViewerInfo = {
        vid: sanitizeId(params.get("vid")) || crypto.randomUUID(),
        name: sanitizeName(params.get("name")) || "Guest",
      };
      // Tag with the role and the viewer id so the host can target this socket.
      // The Hibernation API restores tags + attachment after an idle period.
      this.state.acceptWebSocket(server, ["viewer", `v:${info.vid}`]);
      server.serializeAttachment(info);
      this.send("host", { __relay: "viewer-join", id: info.vid, name: info.name });
    } else {
      this.state.acceptWebSocket(server, ["host"]);
      // A (re)joining host needs to learn about viewers already in the room —
      // e.g. after the host reloads the page — so it re-sends its snapshot,
      // rebuilds its roster, and restores any granted permissions.
      for (const viewer of this.state.getWebSockets("viewer")) {
        const info = viewer.deserializeAttachment() as ViewerInfo | null;
        if (!info) continue;
        try {
          server.send(
            JSON.stringify({
              __relay: "viewer-join",
              id: info.vid,
              name: info.name,
            } satisfies RelayFrame),
          );
        } catch {
          /* skip */
        }
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // A message addressed to everyone (`{"__all":...}`, e.g. chat) goes to every
    // other socket, regardless of who sent it.
    if (typeof message === "string" && message.startsWith('{"__all":')) {
      for (const target of this.state.getWebSockets()) {
        if (target === ws) continue;
        try {
          target.send(message);
        } catch {
          /* socket closing; skip */
        }
      }
      return;
    }
    const isHost = this.state.getTags(ws).includes("host");
    if (isHost) {
      // A host message addressed to one viewer (`{"__to":"<id>",...}`) goes only
      // to that viewer; everything else is broadcast to all viewers.
      const target = typeof message === "string" ? targetedRecipient(message) : null;
      this.forward(target ? `v:${target}` : "viewer", message);
    } else {
      // Anything else a viewer sends goes to the host(s).
      this.forward("host", message);
    }
  }

  webSocketClose(ws: WebSocket): void {
    const isHost = this.state.getTags(ws).includes("host");
    if (isHost) {
      // Only tell viewers the host left once no host remains. During a host
      // reload the new socket can connect before the old one's close fires, and
      // we must not knock the recovered viewers back into the "host left" state.
      const otherHosts = this.state.getWebSockets("host").filter((s) => s !== ws);
      if (otherHosts.length === 0) this.send("viewer", { __relay: "host-left" });
    } else {
      const info = ws.deserializeAttachment() as ViewerInfo | null;
      if (info) this.send("host", { __relay: "viewer-leave", id: info.vid });
    }
  }

  webSocketError(): void {}

  private forward(tag: string, message: string | ArrayBuffer): void {
    for (const target of this.state.getWebSockets(tag)) {
      try {
        target.send(message);
      } catch {
        /* socket closing; skip */
      }
    }
  }

  private send(tag: string, frame: RelayFrame): void {
    this.forward(tag, JSON.stringify(frame));
  }
}

// Cheap check + parse: only messages that start with `{"__to":` are targeted, so
// stroke/viewport traffic isn't parsed. Returns the recipient viewer id or null.
function targetedRecipient(message: string): string | null {
  if (!message.startsWith('{"__to":')) return null;
  try {
    const parsed = JSON.parse(message) as { __to?: unknown };
    return typeof parsed.__to === "string" ? parsed.__to : null;
  } catch {
    return null;
  }
}
