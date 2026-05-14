import Peer, { type DataConnection } from "peerjs";
import type {
  SessionAdapter,
  SessionHostHandlers,
  SessionViewerHandlers,
  SyncMessage,
} from "@/core/sync";
import { sessionPeerId } from "@/core/sync";

function friendlyError(err: Error): Error {
  const type = (err as { type?: string }).type;
  let msg: string;
  switch (type) {
    case "peer-unavailable":
      msg = "Host not found. Check the session code and make sure the host has started sharing.";
      break;
    case "network":
      msg = "Network error. Both devices must be on the same Wi-Fi network.";
      break;
    case "server-error":
      msg = "Could not reach the signaling server. Check your internet connection.";
      break;
    case "socket-error":
    case "socket-closed":
      msg = "Connection lost. Check your network and try again.";
      break;
    case "webrtc":
      msg = "WebRTC connection failed. Both devices need to be on the same Wi-Fi network.";
      break;
    default:
      msg = err.message || "Unknown connection error";
  }
  return new Error(msg);
}

export class PeerJSSession implements SessionAdapter {
  private peer: Peer | undefined;
  private connections = new Map<string, DataConnection>();

  isOpen(): boolean {
    return this.peer !== undefined && !this.peer.destroyed;
  }

  async host(sessionId: string, handlers: SessionHostHandlers): Promise<void> {
    const peerId = sessionPeerId(sessionId);
    this.peer = new Peer(peerId, { debug: 1 });
    await this.waitForOpen(this.peer);
    this.peer.on("error", (err) => handlers.onError(friendlyError(err)));
    this.peer.on("connection", (conn) => {
      conn.on("open", () => {
        this.connections.set(conn.peer, conn);
      });
      conn.on("data", (data) => {
        if ((data as SyncMessage).t === "viewer-ready") {
          handlers.onViewerJoin(conn.peer);
        }
      });
      conn.on("close", () => {
        this.connections.delete(conn.peer);
        handlers.onViewerLeave(conn.peer);
      });
      conn.on("error", (err) => handlers.onError(friendlyError(err as Error)));
    });
  }

  async join(sessionId: string, handlers: SessionViewerHandlers): Promise<void> {
    this.peer = new Peer({ debug: 1 });
    await this.waitForOpen(this.peer);
    this.peer.on("error", (err) => handlers.onError(friendlyError(err)));
    const conn = this.peer.connect(sessionPeerId(sessionId), {
      reliable: true,
      serialization: "json",
    });
    const opened = new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("Could not reach host. Make sure both devices are on the same Wi-Fi network.")),
        15000,
      );
      conn.on("open", () => {
        clearTimeout(t);
        this.connections.set(conn.peer, conn);
        conn.send({ t: "viewer-ready" } satisfies SyncMessage);
        handlers.onConnected();
        resolve();
      });
      conn.on("error", (err) => {
        clearTimeout(t);
        reject(friendlyError(err as Error));
      });
    });
    conn.on("data", (data) => {
      try {
        const msg = data as SyncMessage;
        if (msg.t === "viewer-ready") return;
        handlers.onMessage(msg);
      } catch (err) {
        handlers.onError(err as Error);
      }
    });
    conn.on("close", () => handlers.onDisconnect());
    await opened;
  }

  send(msg: SyncMessage): void {
    if (!this.peer) return;
    for (const conn of this.connections.values()) {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch {
          /* drop on error; viewer can re-request */
        }
      }
    }
  }

  close(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        /* noop */
      }
    }
    this.connections.clear();
    this.peer?.destroy();
    this.peer = undefined;
  }

  private waitForOpen(peer: Peer): Promise<void> {
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        peer.off("open", onOpen);
        peer.off("error", onErr);
        resolve();
      };
      const onErr = (err: Error) => {
        peer.off("open", onOpen);
        peer.off("error", onErr);
        reject(friendlyError(err));
      };
      peer.on("open", onOpen);
      peer.on("error", onErr);
    });
  }
}
