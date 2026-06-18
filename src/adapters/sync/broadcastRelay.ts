/**
 * Client-side adapter for the DrawShare broadcast relay server.
 *
 * Host:   connects to ws://<relay>/host/<CODE>, pushes every SyncMessage.
 * Viewer: connects to ws://<relay>/view/<CODE>, receives the full catch-up
 *         snapshot + live delta as plain SyncMessages.
 *
 * This is intentionally separate from the WebRTC adapter: the broadcast relay
 * is a one-to-many read-only channel optimised for internet-scale viewing,
 * while WebRTC handles low-latency peer editing on a local network.
 */

import type { SessionHostHandlers, SessionViewerHandlers, SyncMessage } from "@/core/sync";

// Extra callbacks the broadcast relay sends back to the host.
export interface BroadcastHostHandlers extends SessionHostHandlers {
  onViewerCountChange(count: number): void;
}

// Internal-only messages the relay server sends to clients.
type RelayServerMsg =
  | { t: "broadcast-ready"; viewerCount: number }
  | { t: "broadcast-viewer-join"; count: number }
  | { t: "broadcast-viewer-leave"; count: number }
  | { t: "broadcast-host-left" };

export class BroadcastRelayAdapter {
  private ws: WebSocket | undefined;
  // Messages queued before the WebSocket opens.
  private queue: string[] = [];

  /**
   * Connect to the relay as the broadcast host.
   * Resolves once the server acknowledges the connection ("broadcast-ready").
   */
  async host(relayUrl: string, code: string, handlers: BroadcastHostHandlers): Promise<void> {
    const wsUrl = toWsUrl(relayUrl, `host/${code.toUpperCase()}`);
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        for (const msg of this.queue) ws.send(msg);
        this.queue = [];
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as RelayServerMsg;
          switch (msg.t) {
            case "broadcast-ready":
              handlers.onViewerCountChange(msg.viewerCount);
              resolve();
              break;
            case "broadcast-viewer-join":
              handlers.onViewerJoin(String(msg.count));
              handlers.onViewerCountChange(msg.count);
              break;
            case "broadcast-viewer-leave":
              handlers.onViewerLeave(String(msg.count));
              handlers.onViewerCountChange(msg.count);
              break;
          }
        } catch {
          /* ignore malformed relay messages */
        }
      };

      ws.onerror = () => reject(new Error("Broadcast relay connection failed."));

      ws.onclose = (ev) => {
        if (ev.code === 4001) {
          reject(new Error("Another host is already streaming on this code."));
        } else if (!ev.wasClean) {
          handlers.onError(new Error("Broadcast relay disconnected unexpectedly."));
        }
      };
    });
  }

  /**
   * Connect to the relay as a read-only viewer.
   * Resolves once the WebSocket opens; the initial snapshot arrives shortly
   * after via onMessage/onConnected callbacks.
   */
  async join(relayUrl: string, code: string, handlers: SessionViewerHandlers): Promise<void> {
    const wsUrl = toWsUrl(relayUrl, `view/${code.toUpperCase()}`);
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    let receivedHello = false;

    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve();

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as SyncMessage | RelayServerMsg;
          if (msg.t === "broadcast-host-left") {
            handlers.onDisconnect("The host ended the broadcast.");
            return;
          }
          handlers.onMessage(msg as SyncMessage);
          // Fire onConnected after the first hello so the UI transitions to
          // "connected" once the initial canvas state is available.
          if (!receivedHello && (msg as SyncMessage).t === "hello") {
            receivedHello = true;
            handlers.onConnected();
          }
        } catch {
          /* ignore malformed messages */
        }
      };

      ws.onerror = () => reject(new Error("Broadcast relay connection failed."));

      ws.onclose = (ev) => {
        if (!ev.wasClean) handlers.onDisconnect("Broadcast relay disconnected.");
      };
    });
  }

  send(msg: SyncMessage): void {
    const data = JSON.stringify(msg);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(data);
      return;
    }
    this.ws.send(data);
  }

  close(): void {
    this.ws?.close();
    this.ws = undefined;
    this.queue = [];
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

function toWsUrl(relayUrl: string, path: string): string {
  const base = relayUrl.replace(/\/$/, "").replace(/^http/, "ws");
  return `${base}/${path}`;
}
