import Peer, { type DataConnection } from "peerjs";
import type {
  SessionAdapter,
  SessionHostHandlers,
  SessionViewerHandlers,
  SyncMessage,
} from "@/core/sync";
import { sessionPeerId } from "@/core/sync";

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
    this.peer.on("error", (err) => handlers.onError(err));
    this.peer.on("connection", (conn) => {
      conn.on("open", () => {
        this.connections.set(conn.peer, conn);
        handlers.onViewerJoin(conn.peer);
      });
      conn.on("close", () => {
        this.connections.delete(conn.peer);
        handlers.onViewerLeave(conn.peer);
      });
      conn.on("error", (err) => handlers.onError(err as Error));
    });
  }

  async join(sessionId: string, handlers: SessionViewerHandlers): Promise<void> {
    this.peer = new Peer({ debug: 1 });
    await this.waitForOpen(this.peer);
    this.peer.on("error", (err) => handlers.onError(err));
    const conn = this.peer.connect(sessionPeerId(sessionId), {
      reliable: true,
      serialization: "json",
    });
    const opened = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Could not reach host")), 15000);
      conn.on("open", () => {
        clearTimeout(t);
        this.connections.set(conn.peer, conn);
        handlers.onConnected();
        resolve();
      });
      conn.on("error", (err) => {
        clearTimeout(t);
        reject(err as Error);
      });
    });
    conn.on("data", (data) => {
      try {
        const msg = data as SyncMessage;
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
        reject(err);
      };
      peer.on("open", onOpen);
      peer.on("error", onErr);
    });
  }
}
