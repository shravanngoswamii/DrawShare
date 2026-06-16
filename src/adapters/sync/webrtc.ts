import type {
  SessionAdapter,
  SessionHostHandlers,
  SessionViewerHandlers,
  SyncMessage,
} from "@/core/sync";

type Role = "host" | "viewer";

function encodeDescription(description: RTCSessionDescriptionInit): string {
  const json = JSON.stringify(description);
  let binary = "";
  const bytes = new TextEncoder().encode(json);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeDescription(token: string): RTCSessionDescriptionInit {
  const normalized = token.trim().replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const json = new TextDecoder().decode(bytes);
  const description = JSON.parse(json) as RTCSessionDescriptionInit;
  if (!description.type || !description.sdp) {
    throw new Error("Invalid connection token.");
  }
  return description;
}

function waitForIceGatheringComplete(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", onChange);
  });
}

export class WebRTCSession implements SessionAdapter {
  private peer: RTCPeerConnection | undefined;
  private channel: RTCDataChannel | undefined;
  private role: Role | undefined;
  private hostHandlers: SessionHostHandlers | undefined;
  private viewerHandlers: SessionViewerHandlers | undefined;
  private viewerNotified = false;
  private disconnected = false;
  private pendingMessages: SyncMessage[] = [];

  isOpen(): boolean {
    return this.channel?.readyState === "open";
  }

  async host(sessionId: string, handlers: SessionHostHandlers): Promise<string> {
    this.reset();
    this.role = "host";
    this.hostHandlers = handlers;

    const peer = this.createPeerConnection();
    const channel = peer.createDataChannel(`drawshare-${sessionId}`, { ordered: true });
    this.bindChannel(channel);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer);

    const local = peer.localDescription;
    if (!local) throw new Error("Failed to create offer.");
    return encodeDescription({ type: local.type, sdp: local.sdp ?? "" });
  }

  async join(
    sessionId: string,
    offerToken: string,
    handlers: SessionViewerHandlers,
  ): Promise<string> {
    this.reset();
    this.role = "viewer";
    this.viewerHandlers = handlers;

    const peer = this.createPeerConnection();
    peer.ondatachannel = (event) => {
      if (!this.channel) {
        this.bindChannel(event.channel);
      }
    };

    const offer = decodeDescription(offerToken);
    await peer.setRemoteDescription(offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitForIceGatheringComplete(peer);

    const local = peer.localDescription;
    if (!local) throw new Error("Failed to create answer.");
    void sessionId;
    return encodeDescription({ type: local.type, sdp: local.sdp ?? "" });
  }

  async applyAnswer(answerToken: string): Promise<void> {
    if (!this.peer || this.role !== "host") {
      throw new Error("No active host session.");
    }
    const answer = decodeDescription(answerToken);
    await this.peer.setRemoteDescription(answer);
  }

  send(msg: SyncMessage): void {
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify(msg));
      return;
    }
    this.pendingMessages.push(msg);
  }

  close(): void {
    this.reset();
  }

  private createPeerConnection(): RTCPeerConnection {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peer.onconnectionstatechange = () => {
      const s = peer.connectionState;
      console.log("[WebRTC] connectionState →", s);
      if (s === "failed") {
        this.notifyDisconnect("Connection failed");
      } else if (s === "disconnected") {
        this.notifyDisconnect("Connection lost");
      }
    };
    peer.oniceconnectionstatechange = () => {
      const s = peer.iceConnectionState;
      console.log("[WebRTC] iceConnectionState →", s);
      if (s === "failed") {
        this.notifyDisconnect("ICE negotiation failed");
      } else if (s === "disconnected") {
        this.notifyDisconnect("Network path lost");
      }
    };
    this.peer = peer;
    return peer;
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      if (this.disconnected) return;
      this.flushPendingMessages();
      if (this.role === "host") {
        if (!this.viewerNotified) {
          this.viewerNotified = true;
          this.hostHandlers?.onViewerJoin("viewer");
        }
      } else {
        this.viewerHandlers?.onConnected();
      }
    };
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as SyncMessage;
        if (this.role === "viewer") {
          this.viewerHandlers?.onMessage(msg);
        } else if (this.role === "host") {
          this.hostHandlers?.onViewerMessage?.(msg);
        }
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error("Invalid sync message.");
        if (this.role === "viewer") this.viewerHandlers?.onError(errObj);
        else this.hostHandlers?.onError(errObj);
      }
    };
    channel.onclose = () => {
      console.log("[WebRTC] data channel closed");
      this.notifyDisconnect("Data channel closed");
    };
    channel.onerror = (event) => {
      const msg =
        event instanceof RTCErrorEvent
          ? (event.error?.message ?? "Connection error.")
          : "Connection error.";
      console.warn("[WebRTC] data channel error:", msg);
      this.notifyError(new Error(msg));
    };
  }

  private flushPendingMessages(): void {
    const channel = this.channel;
    if (channel?.readyState !== "open" || this.pendingMessages.length === 0) {
      return;
    }
    const pending = this.pendingMessages;
    this.pendingMessages = [];
    for (const msg of pending) {
      channel.send(JSON.stringify(msg));
    }
  }

  private notifyDisconnect(reason?: string): void {
    if (this.disconnected) return;
    this.disconnected = true;
    if (this.role === "host") {
      this.hostHandlers?.onViewerLeave("viewer");
    } else if (this.role === "viewer") {
      this.viewerHandlers?.onDisconnect(reason);
    }
    this.dispose();
  }

  private notifyError(err: Error): void {
    if (this.role === "host") {
      this.hostHandlers?.onError(err);
    } else if (this.role === "viewer") {
      this.viewerHandlers?.onError(err);
    }
  }

  private reset(): void {
    this.dispose();
    this.disconnected = false;
  }

  private dispose(): void {
    this.channel = undefined;
    this.pendingMessages = [];
    this.role = undefined;
    this.hostHandlers = undefined;
    this.viewerHandlers = undefined;
    this.viewerNotified = false;
    const peer = this.peer;
    this.peer = undefined;
    if (!peer) return;
    try {
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.ondatachannel = null;
      peer.close();
    } catch {
      /* noop */
    }
  }
}
