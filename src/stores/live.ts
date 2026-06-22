import { defineStore } from "pinia";
import { HOST_LEFT_REASON, relayConfigured, WebSocketSession } from "@/adapters/sync/websocket";
import type { SyncMessage } from "@/core/sync";
import { makeSessionCode } from "@/core/sync";
import type { NotebookLayout, NotebookMode, Page, Project, Shape, Stroke } from "@/core/types";

type Mode = "off" | "host" | "viewer";
type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "waiting"
  | "error"
  | "disconnected"
  | "reconnecting";

interface LiveState {
  mode: Mode;
  status: Status;
  code: string;
  viewerCount: number;
  error: string;
  disconnectReason: string;
  reconnectAttempt: number;
  hostViewport: { width: number; height: number };
  hostCamera: { x: number; y: number; zoom: number };
  viewerProject: Project | undefined;
  viewerPages: Page[];
  viewerCurrentPageId: string | undefined;
  viewerStrokes: Stroke[];
  viewerShapes: Shape[];
  viewerLive: Stroke | undefined;
  viewerHostViewport: { width: number; height: number };
  viewerHostCamera: { x: number; y: number; zoom: number };
  viewerPresenter: { mode: "laser" | "spotlight"; x: number; y: number } | null;
  // Notebook stack mirror: every sheet's page-local strokes/shapes + the mode/layout.
  viewerNotebookMode: NotebookMode;
  viewerNotebookLayout: NotebookLayout;
  viewerAllStrokes: Stroke[];
  viewerAllShapes: Shape[];
  // Theme id the host is broadcasting; the viewer mirrors it unless overridden.
  viewerHostTheme: string;
}

// Point-in-time host snapshot sent to a joining viewer.
type HostSnapshot = {
  project: Project;
  pages: Page[];
  currentPageId: string;
  strokes: Stroke[];
  shapes: Shape[];
  notebookMode: NotebookMode;
  notebookLayout: NotebookLayout;
  allStrokes: Stroke[];
  allShapes: Shape[];
  themeId: string;
};

let session: WebSocketSession | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let hostAwayTimer: ReturnType<typeof setTimeout> | undefined;
const MAX_RECONNECT_ATTEMPTS = 3;
// How long a viewer waits for the host to come back (e.g. after a page reload)
// before showing "disconnected". The relay connection stays open meanwhile, so
// recovery is automatic if the host returns sooner.
const HOST_AWAY_GRACE_MS = 45_000;
// Per-tab key remembering an active host session, so a page reload can resume
// the same code instead of minting a new one and dropping every viewer.
const HOST_KEY = "drawshare:live-host";

function rememberHostSession(code: string, projectId: string): void {
  try {
    sessionStorage.setItem(HOST_KEY, JSON.stringify({ code, projectId }));
  } catch {
    /* sessionStorage unavailable; resume-on-reload simply won't work */
  }
}

function forgetHostSession(): void {
  try {
    sessionStorage.removeItem(HOST_KEY);
  } catch {
    /* noop */
  }
}

// Send a notebook's strokes as several batches so no single relay message
// exceeds the size cap on large notebooks.
const STROKE_CHUNK = 40;
function sendStrokesChunked(strokes: Stroke[]): void {
  for (let i = 0; i < strokes.length; i += STROKE_CHUNK) {
    session?.send({ t: "notebook-strokes", strokes: strokes.slice(i, i + STROKE_CHUNK) });
  }
}
const SHAPE_CHUNK = 80;
function sendShapesChunked(shapes: Shape[]): void {
  for (let i = 0; i < shapes.length; i += SHAPE_CHUNK) {
    session?.send({ t: "notebook-shapes", shapes: shapes.slice(i, i + SHAPE_CHUNK) });
  }
}

export const useLiveStore = defineStore("live", {
  state: (): LiveState => ({
    mode: "off",
    status: "idle",
    code: "",
    viewerCount: 0,
    error: "",
    disconnectReason: "",
    reconnectAttempt: 0,
    hostViewport: { width: 1920, height: 1080 },
    hostCamera: { x: 0, y: 0, zoom: 1 },
    viewerProject: undefined,
    viewerPages: [],
    viewerCurrentPageId: undefined,
    viewerStrokes: [],
    viewerShapes: [],
    viewerLive: undefined,
    viewerHostViewport: { width: 1920, height: 1080 },
    viewerHostCamera: { x: 0, y: 0, zoom: 1 },
    viewerPresenter: null,
    viewerNotebookMode: "off",
    viewerNotebookLayout: "vertical",
    viewerAllStrokes: [],
    viewerAllShapes: [],
    viewerHostTheme: "",
  }),
  getters: {
    viewerCurrentPage(state): Page | undefined {
      return state.viewerPages.find((p) => p.id === state.viewerCurrentPageId);
    },
    viewerIsNotebook(state): boolean {
      return state.viewerNotebookMode !== "off";
    },
    isHosting(state): boolean {
      return state.mode === "host" && state.status !== "idle" && state.status !== "error";
    },
    available(): boolean {
      return relayConfigured();
    },
  },
  actions: {
    async startHosting(snapshot: () => HostSnapshot, resumeCode?: string) {
      if (this.mode !== "off") return;
      if (!relayConfigured()) {
        this.error = "Live sharing is not configured.";
        this.status = "error";
        return;
      }
      const activeSession = new WebSocketSession();
      session = activeSession;
      this.code = resumeCode ?? makeSessionCode();
      this.mode = "host";
      this.status = "connecting";
      this.viewerCount = 0;
      this.error = "";
      // Remember the session for this tab so a reload resumes the same code.
      rememberHostSession(this.code, snapshot().project.id);
      try {
        await activeSession.host(this.code, {
          onViewerJoin: () => {
            if (session !== activeSession) return;
            this.viewerCount = this.viewerCount + 1;
            const snap = snapshot();
            const notebook = snap.notebookMode !== "off";
            const msg: SyncMessage = {
              t: "hello",
              project: snap.project,
              pages: snap.pages,
              currentPageId: snap.currentPageId,
              strokes: snap.strokes,
              shapes: snap.shapes,
              hostViewport: { ...this.hostViewport },
              hostCamera: { ...this.hostCamera },
              notebookMode: snap.notebookMode,
              notebookLayout: snap.notebookLayout,
              // Notebook strokes/shapes follow in chunked messages to avoid one
              // oversized relay send.
              allStrokes: [],
              allShapes: [],
              themeId: snap.themeId,
            };
            session?.send(msg);
            if (notebook) {
              sendStrokesChunked(snap.allStrokes);
              sendShapesChunked(snap.allShapes);
            }
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
        this.status = "waiting";
      } catch (err) {
        if (session === activeSession) {
          this.error = (err as Error).message;
          this.status = "error";
          session.close();
          session = undefined;
          this.mode = "off";
          forgetHostSession();
        }
      }
    },

    // Re-host with the same code after a page reload, if this tab had an active
    // session for the project now open. Viewers waiting on the relay recover
    // automatically once the host reconnects.
    resumeHostingIfPending(snapshot: () => HostSnapshot) {
      if (this.mode !== "off" || !relayConfigured()) return;
      let saved: { code?: string; projectId?: string } | null = null;
      try {
        const raw = sessionStorage.getItem(HOST_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch {
        saved = null;
      }
      if (!saved?.code || saved.projectId !== snapshot().project.id) return;
      void this.startHosting(snapshot, saved.code);
    },

    broadcastTheme(themeId: string) {
      this.broadcast({ t: "theme", themeId });
    },

    stop() {
      // Tell viewers the session is over so they end cleanly rather than waiting
      // for the host to return (which a plain disconnect can't distinguish).
      if (this.mode === "host" && this.viewerCount > 0) {
        session?.send({ t: "session-ended" });
      }
      if (this.mode === "host") forgetHostSession();
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (hostAwayTimer !== undefined) {
        clearTimeout(hostAwayTimer);
        hostAwayTimer = undefined;
      }
      session?.close();
      session = undefined;
      this.mode = "off";
      this.status = "idle";
      this.code = "";
      this.viewerCount = 0;
      this.error = "";
      this.disconnectReason = "";
      this.reconnectAttempt = 0;
      this.viewerProject = undefined;
      this.viewerPages = [];
      this.viewerCurrentPageId = undefined;
      this.viewerStrokes = [];
      this.viewerShapes = [];
      this.viewerLive = undefined;
      this.viewerHostViewport = { width: 1920, height: 1080 };
      this.viewerHostCamera = { x: 0, y: 0, zoom: 1 };
      this.viewerPresenter = null;
      this.viewerNotebookMode = "off";
      this.viewerNotebookLayout = "vertical";
      this.viewerAllStrokes = [];
      this.viewerAllShapes = [];
      this.viewerHostTheme = "";
    },

    setHostViewport(width: number, height: number) {
      if (this.hostViewport.width === width && this.hostViewport.height === height) return;
      this.hostViewport = { width, height };
      if (this.mode === "host" && this.viewerCount > 0) {
        const { x, y, zoom } = this.hostCamera;
        session?.send({ t: "viewport", width, height, camX: x, camY: y, camZoom: zoom });
      }
    },

    setHostCamera(x: number, y: number, zoom: number) {
      const c = this.hostCamera;
      if (Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5 && Math.abs(c.zoom - zoom) < 0.0005)
        return;
      this.hostCamera = { x, y, zoom };
      if (this.mode === "host" && this.viewerCount > 0) {
        const { width, height } = this.hostViewport;
        session?.send({ t: "viewport", width, height, camX: x, camY: y, camZoom: zoom });
      }
    },

    async join(code: string) {
      if (!relayConfigured()) {
        this.mode = "viewer";
        this.code = code.toUpperCase();
        this.error = "Live sharing is not configured.";
        this.status = "error";
        return;
      }
      // If this is a fresh join (not an auto-reconnect), reset everything.
      const isReconnect = this.mode === "viewer" && this.status === "reconnecting";
      if (!isReconnect) {
        if (this.mode !== "off") this.stop();
        this.reconnectAttempt = 0;
        this.disconnectReason = "";
      }
      // Close any existing session before creating a new one.
      session?.close();
      const activeSession = new WebSocketSession();
      session = activeSession;
      this.mode = "viewer";
      this.status = "connecting";
      this.code = code.toUpperCase();
      this.error = "";
      try {
        await activeSession.join(this.code, {
          onConnected: () => {
            if (session !== activeSession) return;
            this.status = "connected";
            this.reconnectAttempt = 0;
            this.disconnectReason = "";
          },
          onMessage: (msg) => {
            if (session !== activeSession) return;
            if (msg.t === "session-ended") {
              // Host ended the session deliberately — terminal.
              if (hostAwayTimer !== undefined) {
                clearTimeout(hostAwayTimer);
                hostAwayTimer = undefined;
              }
              this.disconnectReason = "The host ended the session.";
              this.status = "disconnected";
              session?.close();
              session = undefined;
              return;
            }
            // Any host message means we're live again — recovers from a host
            // reload, where the relay re-announces us over the same socket so
            // onConnected (first-message-only) won't fire a second time.
            if (this.status !== "connected") {
              this.status = "connected";
              this.reconnectAttempt = 0;
              this.disconnectReason = "";
              if (hostAwayTimer !== undefined) {
                clearTimeout(hostAwayTimer);
                hostAwayTimer = undefined;
              }
            }
            this.applyMessage(msg);
          },
          onDisconnect: (reason?: string) => {
            if (session !== activeSession) return;
            // Host dropped (likely reloading): the relay connection is still
            // open, so keep waiting — the relay re-announces us when the host
            // returns and we recover on the next message. Give up after a grace
            // window if they never come back.
            if (reason === HOST_LEFT_REASON) {
              this.disconnectReason = "The host disconnected — waiting for them to return.";
              this.status = "reconnecting";
              if (hostAwayTimer !== undefined) clearTimeout(hostAwayTimer);
              hostAwayTimer = setTimeout(() => {
                hostAwayTimer = undefined;
                if (session !== activeSession || this.status === "connected") return;
                this.status = "disconnected";
                this.disconnectReason = "The host did not return.";
                session?.close();
                session = undefined;
              }, HOST_AWAY_GRACE_MS);
              return;
            }
            // Genuine connection loss (relay/socket gone): reconnect by reopening.
            this.disconnectReason = reason ?? "Connection lost";
            if (this.reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
              this.status = "reconnecting";
              if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => {
                reconnectTimer = undefined;
                if (this.mode !== "viewer" || this.status !== "reconnecting") return;
                this.reconnectAttempt += 1;
                void this.join(this.code);
              }, 2_000);
            } else {
              this.status = "disconnected";
            }
          },
          onError: (err) => {
            if (session !== activeSession) return;
            this.error = err.message;
            this.status = "error";
          },
        });
        if (session !== activeSession) return;
        // Connected to the relay; wait for the host's first message to go live.
        if (this.status === "connecting") {
          this.status = "waiting";
        }
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

    broadcast(msg: SyncMessage) {
      if (this.mode !== "host" || this.viewerCount === 0) return;
      session?.send(msg);
    },

    applyMessage(msg: SyncMessage) {
      switch (msg.t) {
        case "hello": {
          this.viewerProject = msg.project;
          this.viewerPages = msg.pages;
          this.viewerCurrentPageId = msg.currentPageId;
          this.viewerStrokes = msg.strokes;
          this.viewerShapes = msg.shapes ?? [];
          this.viewerLive = undefined;
          this.viewerHostViewport = { ...msg.hostViewport };
          this.viewerHostCamera = { ...msg.hostCamera };
          this.viewerNotebookMode = msg.notebookMode ?? "off";
          this.viewerNotebookLayout = msg.notebookLayout ?? "vertical";
          this.viewerAllStrokes = msg.allStrokes ?? [];
          this.viewerAllShapes = msg.allShapes ?? [];
          this.viewerHostTheme = msg.themeId ?? "";
          break;
        }
        case "notebook-sync": {
          this.viewerNotebookMode = msg.notebookMode;
          this.viewerNotebookLayout = msg.notebookLayout;
          this.viewerPages = msg.pages;
          this.viewerAllStrokes = msg.allStrokes;
          this.viewerAllShapes = msg.allShapes;
          this.viewerLive = undefined;
          break;
        }
        case "notebook-strokes": {
          this.viewerAllStrokes = this.viewerAllStrokes.concat(msg.strokes);
          break;
        }
        case "notebook-shapes": {
          this.viewerAllShapes = this.viewerAllShapes.concat(msg.shapes);
          break;
        }
        case "notebook-layout": {
          this.viewerNotebookLayout = msg.layout;
          break;
        }
        case "viewport": {
          this.viewerHostViewport = { width: msg.width, height: msg.height };
          this.viewerHostCamera = { x: msg.camX, y: msg.camY, zoom: msg.camZoom };
          break;
        }
        case "page-set": {
          this.viewerPages = msg.pages;
          this.viewerLive = undefined;
          if (this.viewerIsNotebook) {
            // Notebook: replace just this sheet's strokes/shapes in the full stack
            // (used by the host's area-erase / undo flush).
            this.viewerAllStrokes = this.viewerAllStrokes
              .filter((s) => s.pageId !== msg.pageId)
              .concat(msg.strokes);
            this.viewerAllShapes = this.viewerAllShapes
              .filter((s) => s.pageId !== msg.pageId)
              .concat(msg.shapes);
          } else {
            this.viewerCurrentPageId = msg.pageId;
            this.viewerStrokes = msg.strokes;
            this.viewerShapes = msg.shapes;
          }
          break;
        }
        case "page-add": {
          this.viewerPages = msg.pages;
          break;
        }
        case "page-delete": {
          this.viewerPages = msg.pages;
          if (this.viewerIsNotebook) {
            this.viewerAllStrokes = this.viewerAllStrokes.filter((s) => s.pageId !== msg.pageId);
            this.viewerAllShapes = this.viewerAllShapes.filter((s) => s.pageId !== msg.pageId);
          } else if (this.viewerCurrentPageId === msg.pageId) {
            this.viewerCurrentPageId = msg.fallbackPageId;
            this.viewerStrokes = [];
            this.viewerShapes = [];
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
        case "page-size": {
          const p = this.viewerPages.find((x) => x.id === msg.pageId);
          if (p) {
            p.width = msg.width;
            p.height = msg.height;
          }
          break;
        }
        case "stroke-begin": {
          // Notebook renders the whole stack, so accept live strokes on any sheet.
          if (!this.viewerIsNotebook && msg.stroke.pageId !== this.viewerCurrentPageId) break;
          this.viewerLive = { ...msg.stroke };
          break;
        }
        case "stroke-points": {
          if (!this.viewerIsNotebook && msg.pageId !== this.viewerCurrentPageId) break;
          const live = this.viewerLive;
          if (!live || live.id !== msg.strokeId) break;
          live.points = live.points.concat(msg.points);
          this.viewerLive = { ...live };
          break;
        }
        case "stroke-commit": {
          this.viewerLive = undefined;
          if (this.viewerIsNotebook) {
            if (this.viewerAllStrokes.some((s) => s.id === msg.stroke.id)) break;
            this.viewerAllStrokes = [...this.viewerAllStrokes, msg.stroke];
          } else {
            if (msg.stroke.pageId !== this.viewerCurrentPageId) break;
            if (this.viewerStrokes.some((s) => s.id === msg.stroke.id)) break;
            this.viewerStrokes = [...this.viewerStrokes, msg.stroke];
          }
          break;
        }
        case "stroke-cancel": {
          if (this.viewerLive && this.viewerLive.id === msg.strokeId) {
            this.viewerLive = undefined;
          }
          break;
        }
        case "stroke-delete": {
          if (this.viewerIsNotebook) {
            this.viewerAllStrokes = this.viewerAllStrokes.filter((s) => s.id !== msg.strokeId);
          } else {
            this.viewerStrokes = this.viewerStrokes.filter((s) => s.id !== msg.strokeId);
          }
          break;
        }
        case "shape-commit": {
          if (this.viewerIsNotebook) {
            if (this.viewerAllShapes.some((s) => s.id === msg.shape.id)) break;
            this.viewerAllShapes = [...this.viewerAllShapes, msg.shape];
          } else {
            if (msg.shape.pageId !== this.viewerCurrentPageId) break;
            if (this.viewerShapes.some((s) => s.id === msg.shape.id)) break;
            this.viewerShapes = [...this.viewerShapes, msg.shape];
          }
          break;
        }
        case "shape-delete": {
          if (this.viewerIsNotebook) {
            this.viewerAllShapes = this.viewerAllShapes.filter((s) => s.id !== msg.shapeId);
          } else {
            this.viewerShapes = this.viewerShapes.filter((s) => s.id !== msg.shapeId);
          }
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
          if (this.viewerIsNotebook) {
            this.viewerAllStrokes = this.viewerAllStrokes.filter((s) => s.pageId !== msg.pageId);
            this.viewerAllShapes = this.viewerAllShapes.filter((s) => s.pageId !== msg.pageId);
          } else if (msg.pageId === this.viewerCurrentPageId) {
            this.viewerStrokes = [];
            this.viewerShapes = [];
          }
          break;
        }
        case "presenter": {
          this.viewerPresenter = { mode: msg.mode, x: msg.x, y: msg.y };
          break;
        }
        case "presenter-off": {
          this.viewerPresenter = null;
          break;
        }
        case "theme": {
          this.viewerHostTheme = msg.themeId;
          break;
        }
        case "viewer-ready":
        case "session-ended":
          break;
      }
    },
  },
});
