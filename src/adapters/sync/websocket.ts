import type {
  SessionAdapter,
  SessionHostHandlers,
  SessionViewerHandlers,
  SyncMessage,
  ViewerIdentity,
} from "@/core/sync";

// Talks to the Cloudflare relay (a Durable Object per session code). The host
// connects as `host`, viewers as `viewer` (carrying their id + name); the relay
// fans messages out between them. Control frames carry `__relay`; app messages
// carry `t`. A host message addressed to one viewer is wrapped with `__to`.

type Role = "host" | "viewer";
type RelayFrame =
  | { __relay: "viewer-join"; id: string; name: string }
  | { __relay: "viewer-leave"; id: string }
  | { __relay: "host-left" };

// Disconnect reason for when the host intentionally leaves. The relay stays up,
// so a reconnect would succeed but never find a host — the store treats this as
// terminal rather than retrying.
export const HOST_LEFT_REASON = "The host ended the session.";

const RELAY_URL = import.meta.env.VITE_LIVE_RELAY_URL;

export function relayConfigured(): boolean {
  return typeof RELAY_URL === "string" && RELAY_URL.trim().length > 0;
}

function roomUrl(code: string, role: Role, identity?: ViewerIdentity): string {
  const base = (RELAY_URL ?? "").trim().replace(/\/$/, "");
  let url = `${base}/room/${encodeURIComponent(code)}?role=${role}`;
  if (role === "viewer" && identity) {
    url += `&vid=${encodeURIComponent(identity.id)}&name=${encodeURIComponent(identity.name)}`;
  }
  return url;
}

export class WebSocketSession implements SessionAdapter {
  private ws: WebSocket | undefined;
  private role: Role | undefined;
  private identity: ViewerIdentity | undefined;
  private hostHandlers: SessionHostHandlers | undefined;
  private viewerHandlers: SessionViewerHandlers | undefined;
  private pending: SyncMessage[] = [];
  private closed = false;
  private opened = false;
  private gotMessage = false;

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  host(sessionId: string, handlers: SessionHostHandlers): Promise<void> {
    this.role = "host";
    this.hostHandlers = handlers;
    return this.connect(sessionId, "host");
  }

  join(
    sessionId: string,
    identity: ViewerIdentity,
    handlers: SessionViewerHandlers,
  ): Promise<void> {
    this.role = "viewer";
    this.identity = identity;
    this.viewerHandlers = handlers;
    return this.connect(sessionId, "viewer");
  }

  send(msg: SyncMessage): void {
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return;
    }
    this.pending.push(msg);
  }

  // Host -> single viewer. `__to` must be the first key so the relay's cheap
  // prefix check routes it without parsing every message.
  sendTo(viewerId: string, msg: SyncMessage): void {
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ __to: viewerId, ...msg }));
  }

  close(): void {
    this.closed = true;
    this.pending = [];
    this.hostHandlers = undefined;
    this.viewerHandlers = undefined;
    this.role = undefined;
    const ws = this.ws;
    this.ws = undefined;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* noop */
    }
  }

  private connect(code: string, role: Role): Promise<void> {
    if (!relayConfigured()) {
      return Promise.reject(new Error("Live sharing is not configured."));
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(roomUrl(code, role, this.identity));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not reach the relay."));
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this.opened = true;
        this.flush();
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      ws.onmessage = (event) => this.onData(event.data);
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("Could not reach the relay."));
        }
      };
      ws.onclose = () => {
        if (this.closed) return;
        if (this.role === "viewer") {
          this.viewerHandlers?.onDisconnect(
            this.opened ? "Connection lost" : "Could not reach the relay.",
          );
        } else {
          this.hostHandlers?.onError(new Error("Relay connection lost."));
        }
      };
    });
  }

  private onData(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (parsed && typeof parsed === "object" && "__relay" in parsed) {
      this.onRelayFrame(parsed as RelayFrame);
      return;
    }
    // App message. A host receives these only from permitted viewers; a viewer
    // receives them from the host.
    if (this.role === "host") {
      this.hostHandlers?.onViewerMessage?.(parsed as SyncMessage);
      return;
    }
    if (!this.gotMessage) {
      this.gotMessage = true;
      this.viewerHandlers?.onConnected();
    }
    this.viewerHandlers?.onMessage(parsed as SyncMessage);
  }

  private onRelayFrame(frame: RelayFrame): void {
    if (this.role === "host") {
      if (frame.__relay === "viewer-join") this.hostHandlers?.onViewerJoin(frame.id, frame.name);
      else if (frame.__relay === "viewer-leave") this.hostHandlers?.onViewerLeave(frame.id);
    } else if (frame.__relay === "host-left") {
      this.viewerHandlers?.onDisconnect(HOST_LEFT_REASON);
    }
  }

  private flush(): void {
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN || this.pending.length === 0) return;
    const queued = this.pending;
    this.pending = [];
    for (const msg of queued) ws.send(JSON.stringify(msg));
  }
}
