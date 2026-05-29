import { defineStore } from "pinia";
import { WebRTCSession } from "@/adapters/sync/webrtc";
import {
  relayPublishOffer,
  relayFetchOffer,
  relayPublishAnswer,
  relayFetchAnswer,
} from "@/adapters/sync/relay";
import { makeSessionCode } from "@/core/sync";
import type { SyncMessage } from "@/core/sync";
import type { Page, Project, Stroke } from "@/core/types";

type Mode = "off" | "host" | "viewer";
type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "waiting"
  | "error"
  | "disconnected";

interface LiveState {
  mode: Mode;
  status: Status;
  code: string;
  viewerCount: number;
  error: string;
  relayAvailable: boolean;
  relayChecked: boolean;
  hostViewport: { width: number; height: number };
  hostCamera: { x: number; y: number; zoom: number };
  offerToken: string;
  viewerResponseToken: string;
  viewerProject: Project | undefined;
  viewerPages: Page[];
  viewerCurrentPageId: string | undefined;
  viewerStrokes: Stroke[];
  viewerLive: Stroke | undefined;
  viewerHostViewport: { width: number; height: number };
  viewerHostCamera: { x: number; y: number; zoom: number };
}

let session: WebRTCSession | undefined;
let activePollCode: string | null = null;

export const useLiveStore = defineStore("live", {
  state: (): LiveState => ({
    mode: "off",
    status: "idle",
    code: "",
    viewerCount: 0,
    error: "",
    relayAvailable: false,
    relayChecked: false,
    hostViewport: { width: 1920, height: 1080 },
    hostCamera: { x: 0, y: 0, zoom: 1 },
    offerToken: "",
    viewerResponseToken: "",
    viewerProject: undefined,
    viewerPages: [],
    viewerCurrentPageId: undefined,
    viewerStrokes: [],
    viewerLive: undefined,
    viewerHostViewport: { width: 1920, height: 1080 },
    viewerHostCamera: { x: 0, y: 0, zoom: 1 },
  }),
  getters: {
    viewerCurrentPage(state): Page | undefined {
      return state.viewerPages.find((p) => p.id === state.viewerCurrentPageId);
    },
    isHosting(state): boolean {
      return state.mode === "host" && state.status !== "idle" && state.status !== "error";
    },
  },
  actions: {
    async startHosting(
      snapshot: () => {
        project: Project;
        pages: Page[];
        currentPageId: string;
        strokes: Stroke[];
      },
    ) {
      if (this.mode !== "off") return;
      const activeSession = new WebRTCSession();
      session = activeSession;
      this.code = makeSessionCode();
      this.mode = "host";
      this.status = "connecting";
      this.viewerCount = 0;
      this.error = "";
      this.offerToken = "";
      this.viewerResponseToken = "";
      try {
        const offerToken = await activeSession.host(this.code, {
          onViewerJoin: (id) => {
            if (session !== activeSession) return;
            this.viewerCount = this.viewerCount + 1;
            const snap = snapshot();
            const msg: SyncMessage = {
              t: "hello",
              project: snap.project,
              pages: snap.pages,
              currentPageId: snap.currentPageId,
              strokes: snap.strokes,
              hostViewport: { ...this.hostViewport },
              hostCamera: { ...this.hostCamera },
            };
            session?.send(msg);
            void id;
          },
          onViewerLeave: () => {
            if (session !== activeSession) return;
            this.viewerCount = Math.max(0, this.viewerCount - 1);
          },
          onError: (err) => {
            if (session !== activeSession) return;
            this.error = err.message;
            this.status = "error";
          },
        });
        if (session !== activeSession) return;
        this.offerToken = offerToken;
        this.status = "waiting";

        // Try relay (non-blocking) — falls back to manual if unavailable
        relayPublishOffer(this.code, offerToken)
          .then(() => {
            if (session !== activeSession) return;
            this.relayAvailable = true;
            this.relayChecked = true;
            void this.startPollingForAnswer(this.code);
          })
          .catch(() => {
            if (session !== activeSession) return;
            this.relayChecked = true;
          });
      } catch (err) {
        if (session === activeSession) {
          this.error = (err as Error).message;
          this.status = "error";
          session.close();
          session = undefined;
          this.mode = "off";
        }
      }
    },

    stop() {
      activePollCode = null;
      session?.close();
      session = undefined;
      this.mode = "off";
      this.status = "idle";
      this.code = "";
      this.viewerCount = 0;
      this.error = "";
      this.relayAvailable = false;
      this.relayChecked = false;
      this.viewerProject = undefined;
      this.viewerPages = [];
      this.viewerCurrentPageId = undefined;
      this.viewerStrokes = [];
      this.viewerLive = undefined;
      this.viewerHostViewport = { width: 1920, height: 1080 };
      this.viewerHostCamera = { x: 0, y: 0, zoom: 1 };
      this.offerToken = "";
      this.viewerResponseToken = "";
    },

    async startPollingForAnswer(code: string) {
      activePollCode = code;
      for (let i = 0; i < 90; i++) {
        await new Promise<void>((r) => setTimeout(r, 2_000));
        if (activePollCode !== code || this.mode !== "host") return;
        if (this.status === "connected") return;
        const answer = await relayFetchAnswer(code).catch(() => null);
        if (!answer) continue;
        if (activePollCode !== code) return;
        await this.applyViewerResponse(answer);
        return;
      }
    },

    setHostViewport(width: number, height: number) {
      if (this.hostViewport.width === width && this.hostViewport.height === height) return;
      this.hostViewport = { width, height };
      if (this.mode === "host") {
        const { x, y, zoom } = this.hostCamera;
        session?.send({ t: "viewport", width, height, camX: x, camY: y, camZoom: zoom });
      }
    },

    setHostCamera(x: number, y: number, zoom: number) {
      const c = this.hostCamera;
      if (Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5 && Math.abs(c.zoom - zoom) < 0.0005) return;
      this.hostCamera = { x, y, zoom };
      if (this.mode === "host") {
        const { width, height } = this.hostViewport;
        session?.send({ t: "viewport", width, height, camX: x, camY: y, camZoom: zoom });
      }
    },

    async join(code: string, offerToken: string) {
      if (this.mode !== "off") this.stop();
      const activeSession = new WebRTCSession();
      session = activeSession;
      this.mode = "viewer";
      this.status = "connecting";
      this.code = code.toUpperCase();
      this.error = "";
      this.viewerResponseToken = "";
      try {
        let resolvedOffer = offerToken.trim();
        if (!resolvedOffer) {
          // Relay mode — fetch offer using the session code
          const fetched = await relayFetchOffer(code).catch(() => null);
          if (session !== activeSession) return;
          if (!fetched) {
            this.error = "Session not found. Make sure the host has started sharing.";
            this.status = "error";
            session.close();
            session = undefined;
            this.mode = "off";
            return;
          }
          resolvedOffer = fetched;
        }
        const responseToken = await activeSession.join(this.code, resolvedOffer, {
          onConnected: () => {
            if (session !== activeSession) return;
            this.status = "connected";
          },
          onMessage: (msg) => {
            if (session !== activeSession) return;
            this.applyMessage(msg);
          },
          onDisconnect: () => {
            if (session !== activeSession) return;
            this.status = "disconnected";
          },
          onError: (err) => {
            if (session !== activeSession) return;
            this.error = err.message;
            this.status = "error";
          },
        });
        if (session !== activeSession) return;
        this.viewerResponseToken = responseToken;
        if (this.status === "connecting") {
          this.status = "waiting";
        }
        // Publish answer to relay so host auto-connects (fire-and-forget)
        relayPublishAnswer(code, responseToken).catch(() => null);
      } catch (err) {
        if (session === activeSession) {
          this.error = (err as Error).message;
          this.status = "error";
          session.close();
          session = undefined;
          this.mode = "off";
        }
      }
    },

    async applyViewerResponse(answerToken: string) {
      if (this.mode !== "host" || !session) return;
      const trimmed = answerToken.trim();
      if (!trimmed) return;
      try {
        await session.applyAnswer(trimmed);
      } catch (err) {
        this.error = (err as Error).message;
        this.status = "error";
      }
    },

    broadcast(msg: SyncMessage) {
      if (this.mode !== "host") return;
      session?.send(msg);
    },

    applyMessage(msg: SyncMessage) {
      switch (msg.t) {
        case "hello": {
          this.viewerProject = msg.project;
          this.viewerPages = msg.pages;
          this.viewerCurrentPageId = msg.currentPageId;
          this.viewerStrokes = msg.strokes;
          this.viewerLive = undefined;
          this.viewerHostViewport = { ...msg.hostViewport };
          this.viewerHostCamera = { ...msg.hostCamera };
          break;
        }
        case "viewport": {
          this.viewerHostViewport = { width: msg.width, height: msg.height };
          this.viewerHostCamera = { x: msg.camX, y: msg.camY, zoom: msg.camZoom };
          break;
        }
        case "page-set": {
          this.viewerPages = msg.pages;
          this.viewerCurrentPageId = msg.pageId;
          this.viewerStrokes = msg.strokes;
          this.viewerLive = undefined;
          break;
        }
        case "page-add": {
          this.viewerPages = msg.pages;
          break;
        }
        case "page-delete": {
          this.viewerPages = msg.pages;
          if (this.viewerCurrentPageId === msg.pageId) {
            this.viewerCurrentPageId = msg.fallbackPageId;
            this.viewerStrokes = [];
          }
          break;
        }
        case "page-rename": {
          const p = this.viewerPages.find((x) => x.id === msg.pageId);
          if (p) p.name = msg.name;
          break;
        }
        case "page-background": {
          const p = this.viewerPages.find((x) => x.id === msg.pageId);
          if (p) p.background = msg.background;
          break;
        }
        case "stroke-begin": {
          if (msg.stroke.pageId !== this.viewerCurrentPageId) break;
          this.viewerLive = { ...msg.stroke };
          break;
        }
        case "stroke-points": {
          if (msg.pageId !== this.viewerCurrentPageId) break;
          const live = this.viewerLive;
          if (!live || live.id !== msg.strokeId) break;
          live.points = live.points.concat(msg.points);
          this.viewerLive = { ...live };
          break;
        }
        case "stroke-commit": {
          this.viewerLive = undefined;
          if (msg.stroke.pageId !== this.viewerCurrentPageId) break;
          if (this.viewerStrokes.some((s) => s.id === msg.stroke.id)) break;
          this.viewerStrokes = [...this.viewerStrokes, msg.stroke];
          break;
        }
        case "stroke-cancel": {
          if (this.viewerLive && this.viewerLive.id === msg.strokeId) {
            this.viewerLive = undefined;
          }
          break;
        }
        case "stroke-delete": {
          this.viewerStrokes = this.viewerStrokes.filter((s) => s.id !== msg.strokeId);
          break;
        }
        case "text-commit": {
          const page = this.viewerPages.find((p) => p.id === msg.text.pageId);
          if (page) {
            page.texts = [...(page.texts ?? []).filter((t) => t.id !== msg.text.id), msg.text];
          }
          break;
        }
        case "text-delete": {
          const page = this.viewerPages.find((p) => p.id === msg.pageId);
          if (page?.texts) page.texts = page.texts.filter((t) => t.id !== msg.textId);
          break;
        }
        case "clear-page": {
          if (msg.pageId === this.viewerCurrentPageId) this.viewerStrokes = [];
          break;
        }
        case "viewer-ready":
          break;
      }
    },
  },
});
