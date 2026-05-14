import { defineStore } from "pinia";
import { PeerJSSession } from "@/adapters/sync/peerjs";
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
  hostViewport: { width: number; height: number };
  viewerProject: Project | undefined;
  viewerPages: Page[];
  viewerCurrentPageId: string | undefined;
  viewerStrokes: Stroke[];
  viewerLive: Stroke | undefined;
  viewerHostViewport: { width: number; height: number };
}

let session: PeerJSSession | undefined;

export const useLiveStore = defineStore("live", {
  state: (): LiveState => ({
    mode: "off",
    status: "idle",
    code: "",
    viewerCount: 0,
    error: "",
    hostViewport: { width: 1920, height: 1080 },
    viewerProject: undefined,
    viewerPages: [],
    viewerCurrentPageId: undefined,
    viewerStrokes: [],
    viewerLive: undefined,
    viewerHostViewport: { width: 1920, height: 1080 },
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
      session = new PeerJSSession();
      this.code = makeSessionCode();
      this.mode = "host";
      this.status = "connecting";
      this.viewerCount = 0;
      this.error = "";
      try {
        await session.host(this.code, {
          onViewerJoin: (id) => {
            this.viewerCount = this.viewerCount + 1;
            const snap = snapshot();
            const msg: SyncMessage = {
              t: "hello",
              project: snap.project,
              pages: snap.pages,
              currentPageId: snap.currentPageId,
              strokes: snap.strokes,
              hostViewport: { ...this.hostViewport },
            };
            session?.send(msg);
            void id;
          },
          onViewerLeave: () => {
            this.viewerCount = Math.max(0, this.viewerCount - 1);
          },
          onError: (err) => {
            this.error = err.message;
            this.status = "error";
          },
        });
        this.status = "waiting";
      } catch (err) {
        this.error = (err as Error).message;
        this.status = "error";
        session?.close();
        session = undefined;
        this.mode = "off";
      }
    },

    stop() {
      session?.close();
      session = undefined;
      this.mode = "off";
      this.status = "idle";
      this.code = "";
      this.viewerCount = 0;
      this.error = "";
      this.viewerProject = undefined;
      this.viewerPages = [];
      this.viewerCurrentPageId = undefined;
      this.viewerStrokes = [];
      this.viewerLive = undefined;
      this.viewerHostViewport = { width: 1920, height: 1080 };
    },

    setHostViewport(width: number, height: number) {
      if (this.hostViewport.width === width && this.hostViewport.height === height) return;
      this.hostViewport = { width, height };
      if (this.mode === "host") {
        session?.send({ t: "viewport", width, height });
      }
    },

    async join(code: string) {
      if (this.mode !== "off") this.stop();
      session = new PeerJSSession();
      this.mode = "viewer";
      this.status = "connecting";
      this.code = code.toUpperCase();
      this.error = "";
      try {
        await session.join(this.code, {
          onConnected: () => {
            this.status = "connected";
          },
          onMessage: (msg) => this.applyMessage(msg),
          onDisconnect: () => {
            this.status = "disconnected";
          },
          onError: (err) => {
            this.error = err.message;
            this.status = "error";
          },
        });
      } catch (err) {
        this.error = (err as Error).message;
        this.status = "error";
        session?.close();
        session = undefined;
        this.mode = "off";
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
          break;
        }
        case "viewport": {
          this.viewerHostViewport = { width: msg.width, height: msg.height };
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
        case "clear-page": {
          if (msg.pageId === this.viewerCurrentPageId) this.viewerStrokes = [];
          break;
        }
      }
    },
  },
});
