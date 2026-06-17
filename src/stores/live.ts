import { defineStore } from "pinia";
import {
  relayFetchAnswer,
  relayFetchOffer,
  relayPublishAnswer,
  relayPublishOffer,
} from "@/adapters/sync/relay";
import { WebRTCSession } from "@/adapters/sync/webrtc";
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
  // Collaborative editing
  viewerCanEdit: boolean; // viewer: granted permission to draw
  viewerOwnLive: Stroke | undefined; // viewer: own in-progress stroke (local preview)
  hostGrantedEdit: boolean; // host: whether permission is currently granted
  pendingViewerStrokes: Stroke[]; // host: viewer-committed strokes awaiting persist
}

let session: WebRTCSession | undefined;
let activePollCode: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
const MAX_RECONNECT_ATTEMPTS = 3;

// Send a notebook's strokes as several batches so no single data-channel message
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
    viewerShapes: [],
    viewerLive: undefined,
    viewerHostViewport: { width: 1920, height: 1080 },
    viewerHostCamera: { x: 0, y: 0, zoom: 1 },
    viewerPresenter: null,
    viewerNotebookMode: "off",
    viewerNotebookLayout: "vertical",
    viewerAllStrokes: [],
    viewerAllShapes: [],
    viewerCanEdit: false,
    viewerOwnLive: undefined,
    hostGrantedEdit: false,
    pendingViewerStrokes: [],
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
  },
  actions: {
    async startHosting(
      snapshot: () => {
        project: Project;
        pages: Page[];
        currentPageId: string;
        strokes: Stroke[];
        shapes: Shape[];
        notebookMode: NotebookMode;
        notebookLayout: NotebookLayout;
        allStrokes: Stroke[];
        allShapes: Shape[];
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
              // oversized data-channel send.
              allStrokes: [],
              allShapes: [],
            };
            session?.send(msg);
            if (notebook) {
              sendStrokesChunked(snap.allStrokes);
              sendShapesChunked(snap.allShapes);
            }
            void id;
          },
          onViewerLeave: () => {
            if (session !== activeSession) return;
            this.viewerCount = Math.max(0, this.viewerCount - 1);
          },
          onViewerMessage: (msg) => {
            if (session !== activeSession) return;
            // A permitted viewer committed a stroke — queue it for the editor to
            // persist + broadcast back (completing the round-trip).
            if (msg.t === "viewer-stroke-commit") {
              this.pendingViewerStrokes = [...this.pendingViewerStrokes, msg.stroke];
            }
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
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
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
      this.relayAvailable = false;
      this.relayChecked = false;
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
      this.viewerCanEdit = false;
      this.viewerOwnLive = undefined;
      this.hostGrantedEdit = false;
      this.pendingViewerStrokes = [];
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
      if (Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5 && Math.abs(c.zoom - zoom) < 0.0005)
        return;
      this.hostCamera = { x, y, zoom };
      if (this.mode === "host") {
        const { width, height } = this.hostViewport;
        session?.send({ t: "viewport", width, height, camX: x, camY: y, camZoom: zoom });
      }
    },

    async join(code: string, offerToken: string) {
      // If this is a fresh join (not an auto-reconnect), reset everything.
      const isReconnect = this.mode === "viewer" && this.status === "reconnecting";
      if (!isReconnect) {
        if (this.mode !== "off") this.stop();
        this.reconnectAttempt = 0;
        this.disconnectReason = "";
      }
      // Close any existing session before creating a new one.
      session?.close();
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
            this.reconnectAttempt = 0;
            this.disconnectReason = "";
          },
          onMessage: (msg) => {
            if (session !== activeSession) return;
            this.applyMessage(msg);
          },
          onDisconnect: (reason?: string) => {
            if (session !== activeSession) return;
            this.disconnectReason = reason ?? "Connection lost";
            if (this.reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
              this.status = "reconnecting";
              if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => {
                reconnectTimer = undefined;
                if (this.mode !== "viewer" || this.status !== "reconnecting") return;
                this.reconnectAttempt += 1;
                void this.join(this.code, "");
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

    // ── Collaborative editing ──
    grantEdit() {
      if (this.mode !== "host") return;
      this.hostGrantedEdit = true;
      session?.send({ t: "grant-edit" });
    },
    revokeEdit() {
      if (this.mode !== "host") return;
      this.hostGrantedEdit = false;
      session?.send({ t: "revoke-edit" });
    },
    setViewerOwnLive(stroke: Stroke | undefined) {
      this.viewerOwnLive = stroke;
    },
    sendViewerStroke(msg: SyncMessage) {
      if (this.mode !== "viewer") return;
      session?.send(msg);
    },
    clearPendingViewerStrokes(): Stroke[] {
      const pending = [...this.pendingViewerStrokes];
      this.pendingViewerStrokes = [];
      return pending;
    },

    // Re-snapshot the notebook to viewers (mode/layout/pages), then stream the
    // strokes in chunks. Used when the host toggles canvas mode mid-session.
    broadcastNotebookSync(
      notebookMode: NotebookMode,
      notebookLayout: NotebookLayout,
      pages: Page[],
      allStrokes: Stroke[],
      allShapes: Shape[],
    ) {
      if (this.mode !== "host") return;
      session?.send({
        t: "notebook-sync",
        notebookMode,
        notebookLayout,
        pages,
        allStrokes: [],
        allShapes: [],
      });
      if (notebookMode !== "off") {
        sendStrokesChunked(allStrokes);
        sendShapesChunked(allShapes);
      }
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
        case "grant-edit":
          this.viewerCanEdit = true;
          break;
        case "revoke-edit":
          this.viewerCanEdit = false;
          this.viewerOwnLive = undefined;
          break;
        // Viewer-origin stroke messages are consumed by the host via
        // onViewerMessage; they never reach a viewer's applyMessage.
        case "viewer-stroke-begin":
        case "viewer-stroke-points":
        case "viewer-stroke-commit":
        case "viewer-stroke-cancel":
          break;
        case "viewer-ready":
          break;
      }
    },
  },
});
