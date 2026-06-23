import { defineStore } from "pinia";
import { HOST_LEFT_REASON, relayConfigured, WebSocketSession } from "@/adapters/sync/websocket";
import { newId } from "@/core/ids";
import { downscaleForSync } from "@/core/imageSync";
import { makeViewerName } from "@/core/names";
import type { SyncMessage, ViewerIdentity } from "@/core/sync";
import { makeSessionCode } from "@/core/sync";
import type {
  ImageItem,
  NotebookLayout,
  NotebookMode,
  Page,
  Project,
  Shape,
  Stroke,
} from "@/core/types";
import { useEditorStore } from "./editor";

// A connected viewer as the host sees them.
interface RosterViewer {
  id: string;
  name: string;
  canEdit: boolean;
}

// A chat message as held in the store (`mine` marks the local participant's own).
export interface ChatMessage {
  id: string;
  fromId: string;
  fromName: string;
  text: string;
  ts: number;
  mine: boolean;
  image?: string;
  replyTo?: { id: string; fromName: string; text: string };
  editedTs?: number;
  // emoji -> list of fromIds who reacted with it.
  reactions?: Record<string, string[]>;
}

const HOST_CHAT_ID = "host";
const MAX_CHAT = 500;
const MAX_CHAT_LEN = 2000;

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
  // Host: a secret token that turns the share link into an "edit" link. Anyone
  // who opens /v/<code>#edit=<token> is auto-granted drawing.
  editToken: string;
  viewerCount: number;
  error: string;
  disconnectReason: string;
  reconnectAttempt: number;
  hostViewport: { width: number; height: number };
  hostCamera: { x: number; y: number; zoom: number };
  // Theme id the host is broadcasting; the viewer mirrors it unless overridden.
  viewerHostTheme: string;
  // Collaborative editing.
  viewers: RosterViewer[]; // host: connected viewers + their draw permission
  viewerCanEdit: boolean; // viewer: has the host granted me drawing?
  viewerOwnLive: Stroke | undefined; // viewer: my own in-progress stroke (local preview)
  pendingViewerEdits: SyncMessage[]; // host: viewer edits awaiting persist + rebroadcast
  remoteLiveStrokes: Stroke[]; // host: in-progress strokes from viewers (live preview)
  viewerId: string; // viewer: my stable id this tab
  viewerName: string; // viewer: my display name
  hostName: string; // host: my display name (used as the chat sender name)
  // Chat (host + viewers).
  chat: ChatMessage[];
  unreadChat: number;
  // Read receipts: participant id -> { name, latest message ts they've seen }.
  chatSeen: Record<string, { name: string; ts: number }>;
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
  images: ImageItem[];
  themeId: string;
};

let session: WebSocketSession | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let hostAwayTimer: ReturnType<typeof setTimeout> | undefined;
// Viewer ids the host has granted drawing to. Source of truth for both
// restoring permission when a viewer (re)joins and validating viewer strokes.
let grantedVids = new Set<string>();
// The edit token a viewer joined with (from the edit link); re-sent on reconnect.
let viewerEditToken = "";
const MAX_RECONNECT_ATTEMPTS = 3;
// How long a viewer waits for the host to come back (e.g. after a page reload)
// before showing "disconnected". The relay connection stays open meanwhile, so
// recovery is automatic if the host returns sooner.
const HOST_AWAY_GRACE_MS = 45_000;
// Per-tab key remembering an active host session, so a page reload can resume
// the same code instead of minting a new one and dropping every viewer. Also
// keeps the set of viewers that were granted drawing, so a host reload restores
// their permissions.
const HOST_KEY = "drawshare:live-host";
// Per-tab viewer identity, so a viewer reload keeps the same id + name (and any
// draw permission the host re-grants on rejoin).
const VIEWER_KEY = "drawshare:live-viewer";
// The host's chosen display name (persists across sessions).
const HOST_NAME_KEY = "drawshare:host-name";
// Per-tab chat backlog so a host reload keeps the conversation (and can still
// hand the history to new viewers).
const CHAT_KEY = "drawshare:live-chat";

function loadHostName(): string {
  try {
    return localStorage.getItem(HOST_NAME_KEY) || "Host";
  } catch {
    return "Host";
  }
}

interface HostSession {
  code: string;
  projectId: string;
  granted: string[];
  editToken: string;
}

function readHostSession(): HostSession | null {
  try {
    const raw = sessionStorage.getItem(HOST_KEY);
    return raw ? (JSON.parse(raw) as HostSession) : null;
  } catch {
    return null;
  }
}

function rememberHostSession(
  code: string,
  projectId: string,
  granted: string[],
  editToken: string,
): void {
  try {
    sessionStorage.setItem(HOST_KEY, JSON.stringify({ code, projectId, granted, editToken }));
  } catch {
    /* sessionStorage unavailable; resume-on-reload simply won't work */
  }
}

// An unguessable token for the edit link (URL-safe, ~19 chars).
function makeEditToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(19);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

function forgetHostSession(): void {
  try {
    sessionStorage.removeItem(HOST_KEY);
  } catch {
    /* noop */
  }
}

function loadOrCreateViewerIdentity(): ViewerIdentity {
  try {
    const raw = sessionStorage.getItem(VIEWER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ViewerIdentity;
      if (parsed?.id && parsed?.name) return parsed;
    }
  } catch {
    /* fall through to create */
  }
  const identity: ViewerIdentity = { id: crypto.randomUUID(), name: makeViewerName() };
  try {
    sessionStorage.setItem(VIEWER_KEY, JSON.stringify(identity));
  } catch {
    /* non-persistent identity is fine */
  }
  return identity;
}

// Persist the current granted set against the stored host session (keeps grants
// across a host reload).
function persistGranted(): void {
  const s = readHostSession();
  if (s) rememberHostSession(s.code, s.projectId, [...grantedVids], s.editToken);
}

// Ensure a roster display name is unique by appending a counter on collisions.
function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  let n = 2;
  while (taken.includes(`${name} ${n}`)) n += 1;
  return `${name} ${n}`;
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
    editToken: "",
    viewerCount: 0,
    error: "",
    disconnectReason: "",
    reconnectAttempt: 0,
    hostViewport: { width: 1920, height: 1080 },
    hostCamera: { x: 0, y: 0, zoom: 1 },
    viewerHostTheme: "",
    viewers: [],
    viewerCanEdit: false,
    viewerOwnLive: undefined,
    pendingViewerEdits: [],
    remoteLiveStrokes: [],
    viewerId: "",
    viewerName: "",
    hostName: "Host",
    chat: [],
    unreadChat: 0,
    chatSeen: {},
  }),
  getters: {
    isHosting(state): boolean {
      return state.mode === "host" && state.status !== "idle" && state.status !== "error";
    },
    available(): boolean {
      return relayConfigured();
    },
    // The local participant's display name (host or viewer).
    myName(state): string {
      return state.mode === "host" ? state.hostName : state.viewerName;
    },
    // The local participant's chat id.
    myChatId(state): string {
      return state.mode === "host" ? HOST_CHAT_ID : state.viewerId;
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
      this.viewers = [];
      this.pendingViewerEdits = [];
      this.error = "";
      this.hostName = loadHostName();
      // Restore the chat backlog on a resume (so a reload keeps the conversation).
      if (resumeCode) {
        try {
          const raw = sessionStorage.getItem(CHAT_KEY);
          if (raw) this.chat = JSON.parse(raw) as ChatMessage[];
        } catch {
          /* ignore */
        }
      }
      // Restore granted viewers + edit token on a resume; start fresh otherwise.
      const resumed = resumeCode ? readHostSession() : null;
      grantedVids = new Set(resumed?.granted ?? []);
      this.editToken = resumed?.editToken || makeEditToken();
      // Remember the session for this tab so a reload resumes the same code.
      rememberHostSession(this.code, snapshot().project.id, [...grantedVids], this.editToken);
      try {
        await activeSession.host(this.code, {
          onViewerJoin: (id, name) => {
            if (session !== activeSession) return;
            const canEdit = grantedVids.has(id);
            const others = this.viewers.filter((v) => v.id !== id);
            const display = uniqueName(
              name,
              others.map((v) => v.name),
            );
            this.viewers = [...others, { id, name: display, canEdit }];
            this.viewerCount = this.viewers.length;
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
            // Images aren't in the hello snapshot (they need downscaling); send
            // them to just this viewer.
            void this.sendImagesTo(id, snap.images);
            // Hand the new viewer the chat backlog so they see earlier messages.
            if (this.chat.length > 0) {
              session?.sendTo(id, {
                t: "chat-history",
                messages: this.chat.map((m) => ({
                  id: m.id,
                  fromId: m.fromId,
                  fromName: m.fromName,
                  text: m.text,
                  ts: m.ts,
                  ...(m.image ? { image: m.image } : {}),
                  ...(m.replyTo ? { replyTo: m.replyTo } : {}),
                  ...(m.editedTs ? { editedTs: m.editedTs } : {}),
                  ...(m.reactions ? { reactions: m.reactions } : {}),
                })),
              });
            }
            // Restore a previously granted viewer's permission (e.g. after the
            // host reloaded, or the viewer reconnected).
            if (canEdit) session?.sendTo(id, { t: "grant-edit" });
          },
          onViewerLeave: (id) => {
            if (session !== activeSession) return;
            this.viewers = this.viewers.filter((v) => v.id !== id);
            this.viewerCount = this.viewers.length;
          },
          onViewerMessage: (msg) => {
            if (session !== activeSession) return;
            if (msg.t === "chat") {
              this.appendChat(msg);
              return;
            }
            if (msg.t === "chat-edit") {
              this.applyChatEdit(msg.id, msg.text, msg.editedTs);
              return;
            }
            if (msg.t === "chat-reaction") {
              this.applyChatReaction(msg.id, msg.emoji, msg.fromId, msg.op);
              return;
            }
            if (msg.t === "chat-seen") {
              this.applyChatSeen(msg.who, msg.name, msg.ts);
              return;
            }
            // A viewer renamed itself — update the roster (any connected viewer).
            if (msg.t === "viewer-rename") {
              const v = this.viewers.find((x) => x.id === msg.vid);
              if (v) {
                v.name = uniqueName(
                  msg.name.trim().slice(0, 40) || "Guest",
                  this.viewers.filter((x) => x.id !== msg.vid).map((x) => x.name),
                );
              }
              return;
            }
            // A viewer that joined via the edit link presents its token — grant it.
            if (msg.t === "request-edit") {
              if (this.editToken && msg.token === this.editToken) this.grantEdit(msg.vid);
              return;
            }
            // Everything below is a permitted-viewer-only action.
            if (!("vid" in msg) || !grantedVids.has(msg.vid)) return;
            // Live stroke preview: show it on the host's canvas and relay it to
            // the other viewers so everyone sees it as it's drawn. The author
            // skips its own echo (by stroke id).
            if (msg.t === "viewer-stroke-begin") {
              this.remoteLiveStrokes = [
                ...this.remoteLiveStrokes.filter((s) => s.id !== msg.stroke.id),
                msg.stroke,
              ];
              this.broadcast({ t: "stroke-begin", stroke: msg.stroke });
              return;
            }
            if (msg.t === "viewer-stroke-points") {
              this.remoteLiveStrokes = this.remoteLiveStrokes.map((s) =>
                s.id === msg.strokeId ? { ...s, points: [...s.points, ...msg.points] } : s,
              );
              this.broadcast({
                t: "stroke-points",
                pageId: msg.pageId,
                strokeId: msg.strokeId,
                points: msg.points,
                from: msg.from,
              });
              return;
            }
            if (msg.t === "viewer-stroke-cancel") {
              this.remoteLiveStrokes = this.remoteLiveStrokes.filter((s) => s.id !== msg.strokeId);
              this.broadcast({ t: "stroke-cancel", pageId: msg.pageId, strokeId: msg.strokeId });
              return;
            }
            if (msg.t === "viewer-stroke-commit") {
              this.remoteLiveStrokes = this.remoteLiveStrokes.filter((s) => s.id !== msg.stroke.id);
            }
            // Persisted edits (stroke/shape/text/erase/image commit): queue for the
            // editor to apply, which persists + re-broadcasts to everyone.
            const isPersistEdit =
              msg.t === "viewer-stroke-commit" ||
              msg.t === "viewer-shape-commit" ||
              msg.t === "viewer-text-commit" ||
              msg.t === "viewer-erase-stroke" ||
              msg.t === "viewer-erase-shape" ||
              msg.t === "viewer-image-add" ||
              msg.t === "viewer-image-update" ||
              msg.t === "viewer-image-delete";
            if (isPersistEdit) {
              this.pendingViewerEdits = [...this.pendingViewerEdits, msg];
            }
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
      const saved = readHostSession();
      if (!saved?.code || saved.projectId !== snapshot().project.id) return;
      void this.startHosting(snapshot, saved.code);
    },

    broadcastTheme(themeId: string) {
      this.broadcast({ t: "theme", themeId });
    },

    // Host: send a (downscaled) image to all viewers. Called by the editor when
    // an image is committed while hosting.
    async broadcastImage(image: ImageItem) {
      if (this.mode !== "host" || this.viewerCount === 0) return;
      const src = await downscaleForSync(image.src).catch(() => image.src);
      if (this.mode !== "host") return;
      session?.send({ t: "image-add", image: { ...image, src } });
    },

    // Host: send the board's existing images to one viewer (e.g. on join).
    async sendImagesTo(viewerId: string, images: ImageItem[]) {
      for (const image of images) {
        const src = await downscaleForSync(image.src).catch(() => image.src);
        if (this.mode !== "host") return;
        session?.sendTo(viewerId, { t: "image-add", image: { ...image, src } });
      }
    },

    // ── Collaborative editing ──
    grantEdit(viewerId: string) {
      if (this.mode !== "host") return;
      const v = this.viewers.find((x) => x.id === viewerId);
      if (!v) return;
      v.canEdit = true;
      grantedVids.add(viewerId);
      persistGranted();
      session?.sendTo(viewerId, { t: "grant-edit" });
    },

    revokeEdit(viewerId: string) {
      if (this.mode !== "host") return;
      const v = this.viewers.find((x) => x.id === viewerId);
      if (v) v.canEdit = false;
      grantedVids.delete(viewerId);
      persistGranted();
      session?.sendTo(viewerId, { t: "revoke-edit" });
    },

    setViewerOwnLive(stroke: Stroke | undefined) {
      this.viewerOwnLive = stroke;
    },

    sendViewerEdit(msg: SyncMessage) {
      if (this.mode !== "viewer") return;
      session?.send(msg);
    },

    clearPendingViewerEdits(): SyncMessage[] {
      const pending = this.pendingViewerEdits;
      this.pendingViewerEdits = [];
      return pending;
    },

    // ── Chat ──
    sendChat(
      text: string,
      image?: string,
      replyTo?: { id: string; fromName: string; text: string },
    ) {
      const trimmed = text.trim().slice(0, MAX_CHAT_LEN);
      if ((!trimmed && !image) || this.mode === "off") return;
      const msg: Extract<SyncMessage, { t: "chat" }> = {
        t: "chat",
        id: newId(),
        fromId: this.myChatId,
        fromName: this.myName || (this.mode === "host" ? "Host" : "Guest"),
        text: trimmed,
        ts: Date.now(),
        ...(image ? { image } : {}),
        ...(replyTo ? { replyTo } : {}),
      };
      this.appendChat(msg); // optimistic; the relay excludes the sender
      session?.sendAll(msg);
    },

    // Edit one of your own messages (broadcast the new text to everyone).
    editChat(id: string, text: string) {
      const trimmed = text.trim().slice(0, MAX_CHAT_LEN);
      const m = this.chat.find((x) => x.id === id);
      if (!m?.mine || !trimmed) return;
      const editedTs = Date.now();
      m.text = trimmed;
      m.editedTs = editedTs;
      this.persistChat();
      session?.sendAll({ t: "chat-edit", id, text: trimmed, editedTs });
    },

    appendChat(msg: {
      id: string;
      fromId: string;
      fromName: string;
      text: string;
      ts: number;
      image?: string;
      replyTo?: { id: string; fromName: string; text: string };
      editedTs?: number;
    }) {
      if (this.chat.some((m) => m.id === msg.id)) return;
      const mine = msg.fromId === this.myChatId;
      const entry: ChatMessage = {
        id: msg.id,
        fromId: msg.fromId,
        fromName: msg.fromName,
        text: msg.text,
        ts: msg.ts,
        mine,
        ...(msg.image ? { image: msg.image } : {}),
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
        ...(msg.editedTs ? { editedTs: msg.editedTs } : {}),
      };
      this.chat = [...this.chat, entry].slice(-MAX_CHAT);
      if (!mine) this.unreadChat += 1;
      this.persistChat();
    },

    applyChatEdit(id: string, text: string, editedTs: number) {
      const m = this.chat.find((x) => x.id === id);
      if (!m) return;
      m.text = text;
      m.editedTs = editedTs;
      this.persistChat();
    },

    // Toggle my own emoji reaction on a message, optimistically, and tell everyone.
    toggleReaction(id: string, emoji: string) {
      if (this.mode === "off") return;
      const m = this.chat.find((x) => x.id === id);
      if (!m) return;
      const me = this.myChatId;
      const has = (m.reactions?.[emoji] ?? []).includes(me);
      const op = has ? "remove" : "add";
      this.applyChatReaction(id, emoji, me, op);
      session?.sendAll({ t: "chat-reaction", id, emoji, fromId: me, op });
    },

    applyChatReaction(id: string, emoji: string, fromId: string, op: "add" | "remove") {
      const m = this.chat.find((x) => x.id === id);
      if (!m) return;
      const reactions: Record<string, string[]> = { ...(m.reactions ?? {}) };
      const list = new Set(reactions[emoji] ?? []);
      if (op === "add") list.add(fromId);
      else list.delete(fromId);
      if (list.size) reactions[emoji] = [...list];
      else delete reactions[emoji];
      m.reactions = reactions;
      this.persistChat();
    },

    // A participant reported reading up to `ts`.
    applyChatSeen(who: string, name: string, ts: number) {
      if (who === this.myChatId) return;
      const prev = this.chatSeen[who];
      this.chatSeen = { ...this.chatSeen, [who]: { name, ts: Math.max(prev?.ts ?? 0, ts) } };
    },

    clearChat() {
      this.chat = [];
      this.unreadChat = 0;
      this.chatSeen = {};
      this.persistChat();
    },

    // Merge a chat backlog (received on join) without bumping the unread count.
    mergeChatHistory(
      messages: {
        id: string;
        fromId: string;
        fromName: string;
        text: string;
        ts: number;
        image?: string;
        replyTo?: { id: string; fromName: string; text: string };
        editedTs?: number;
        reactions?: Record<string, string[]>;
      }[],
    ) {
      const seen = new Set(this.chat.map((m) => m.id));
      const incoming = messages
        .filter((m) => !seen.has(m.id))
        .map((m) => ({ ...m, mine: m.fromId === this.myChatId }));
      if (incoming.length === 0) return;
      this.chat = [...incoming, ...this.chat].sort((a, b) => a.ts - b.ts).slice(-MAX_CHAT);
    },

    persistChat() {
      if (this.mode !== "host") return;
      try {
        sessionStorage.setItem(CHAT_KEY, JSON.stringify(this.chat));
      } catch {
        /* ignore */
      }
    },

    markChatRead() {
      this.unreadChat = 0;
      // Tell others we've read up to the latest message (for "Seen" receipts).
      const last = this.chat[this.chat.length - 1];
      if (last && this.mode !== "off") {
        session?.sendAll({ t: "chat-seen", who: this.myChatId, name: this.myName, ts: last.ts });
      }
    },

    // Change the local participant's display name (host or viewer).
    setMyName(name: string) {
      const clean = name.trim().slice(0, 40);
      if (!clean) return;
      if (this.mode === "host") {
        this.hostName = clean;
        try {
          localStorage.setItem(HOST_NAME_KEY, clean);
        } catch {
          /* ignore */
        }
      } else if (this.mode === "viewer") {
        this.viewerName = clean;
        try {
          sessionStorage.setItem(VIEWER_KEY, JSON.stringify({ id: this.viewerId, name: clean }));
        } catch {
          /* ignore */
        }
        // Tell the host so the roster shows the new name.
        session?.send({ t: "viewer-rename", vid: this.viewerId, name: clean });
      }
    },

    stop() {
      // Tell viewers the session is over so they end cleanly rather than waiting
      // for the host to return (which a plain disconnect can't distinguish).
      if (this.mode === "host" && this.viewerCount > 0) {
        session?.send({ t: "session-ended" });
      }
      if (this.mode === "host") {
        forgetHostSession();
        grantedVids = new Set();
        try {
          sessionStorage.removeItem(CHAT_KEY);
        } catch {
          /* ignore */
        }
      }
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
      this.editToken = "";
      this.viewerCount = 0;
      this.error = "";
      this.disconnectReason = "";
      this.reconnectAttempt = 0;
      this.viewerHostTheme = "";
      this.viewers = [];
      this.viewerCanEdit = false;
      this.viewerOwnLive = undefined;
      this.pendingViewerEdits = [];
      this.remoteLiveStrokes = [];
      this.viewerId = "";
      this.viewerName = "";
      this.chat = [];
      this.unreadChat = 0;
      this.chatSeen = {};
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

    async join(code: string, editToken?: string) {
      if (!relayConfigured()) {
        this.mode = "viewer";
        this.code = code.toUpperCase();
        this.error = "Live sharing is not configured.";
        this.status = "error";
        return;
      }
      // If this is a fresh join (not an auto-reconnect), reset everything. The
      // edit token (from the edit link) is kept across reconnects.
      const isReconnect = this.mode === "viewer" && this.status === "reconnecting";
      if (!isReconnect) {
        if (this.mode !== "off") this.stop();
        this.reconnectAttempt = 0;
        this.disconnectReason = "";
        viewerEditToken = editToken ?? "";
      }
      // Close any existing session before creating a new one.
      session?.close();
      const activeSession = new WebSocketSession();
      session = activeSession;
      this.mode = "viewer";
      this.status = "connecting";
      this.code = code.toUpperCase();
      this.error = "";
      const identity = loadOrCreateViewerIdentity();
      this.viewerId = identity.id;
      this.viewerName = identity.name;
      try {
        await activeSession.join(this.code, identity, {
          onConnected: () => {
            if (session !== activeSession) return;
            this.status = "connected";
            this.reconnectAttempt = 0;
            this.disconnectReason = "";
            // Joined via the edit link — ask the host for drawing permission.
            if (viewerEditToken) {
              session?.send({ t: "request-edit", vid: this.viewerId, token: viewerEditToken });
            }
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
              this.clearChat(); // chat is discarded when the host ends the session
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
            // The viewer drives the editor store directly (guest mode), reusing
            // the host's CanvasStage instead of the old ViewerStage mirror.
            this.applyRemoteToEditor(msg);
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
                this.clearChat(); // host gone for good — discard the chat
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

    // Guest mode: apply a host broadcast to the editor store (the viewer reuses
    // the host's CanvasStage). Content goes through editor.applyRemote* (no
    // persist / history / re-broadcast). In-progress strokes ride the existing
    // remoteLiveStrokes preview. Chat/grant/theme are handled here as before;
    // viewport/presenter are ignored (the viewer keeps its own camera).
    applyRemoteToEditor(msg: SyncMessage) {
      const editor = useEditorStore();
      switch (msg.t) {
        case "hello":
          editor.beginGuestSession({
            project: msg.project,
            pages: msg.pages,
            currentPageId: msg.currentPageId,
            strokes: msg.strokes,
            shapes: msg.shapes ?? [],
            notebookMode: msg.notebookMode,
            notebookLayout: msg.notebookLayout,
            allStrokes: msg.allStrokes,
            allShapes: msg.allShapes,
          });
          this.viewerHostTheme = msg.themeId ?? "";
          this.viewerCanEdit = false;
          this.viewerOwnLive = undefined;
          this.remoteLiveStrokes = [];
          break;
        case "notebook-sync":
          editor.applyRemoteNotebookSync(
            msg.notebookMode,
            msg.notebookLayout,
            msg.pages,
            msg.allStrokes,
            msg.allShapes,
          );
          break;
        case "notebook-strokes":
          editor.applyRemoteNotebookStrokes(msg.strokes);
          break;
        case "notebook-shapes":
          editor.applyRemoteNotebookShapes(msg.shapes);
          break;
        case "notebook-layout":
          editor.applyRemoteNotebookLayout(msg.layout);
          break;
        case "page-set":
          editor.applyRemotePageSet(msg.pageId, msg.pages, msg.strokes, msg.shapes);
          break;
        case "page-add":
          editor.applyRemotePages(msg.pages);
          break;
        case "page-delete":
          editor.applyRemotePageDelete(msg.pageId, msg.pages, msg.fallbackPageId);
          break;
        case "page-rename":
          editor.applyRemotePageRename(msg.pageId, msg.name);
          break;
        case "page-background":
          editor.applyRemotePageBackground(msg.pageId, msg.background);
          break;
        case "page-size":
          editor.applyRemotePageSize(msg.pageId, msg.width, msg.height);
          break;
        case "stroke-begin": {
          // Host (or another viewer, relayed) drawing live. Skip our own echo.
          if (this.viewerOwnLive && msg.stroke.id === this.viewerOwnLive.id) break;
          // Page-local previews aren't positioned here, so skip notebook live
          // strokes (the committed stroke still arrives via stroke-commit).
          if (editor.notebookMode !== "off") break;
          this.remoteLiveStrokes = [
            ...this.remoteLiveStrokes.filter((s) => s.id !== msg.stroke.id),
            { ...msg.stroke },
          ];
          break;
        }
        case "stroke-points": {
          if (this.viewerOwnLive && msg.strokeId === this.viewerOwnLive.id) break;
          this.remoteLiveStrokes = this.remoteLiveStrokes.map((s) =>
            s.id === msg.strokeId ? { ...s, points: [...s.points, ...msg.points] } : s,
          );
          break;
        }
        case "stroke-cancel":
          this.remoteLiveStrokes = this.remoteLiveStrokes.filter((s) => s.id !== msg.strokeId);
          break;
        case "stroke-commit":
          this.remoteLiveStrokes = this.remoteLiveStrokes.filter((s) => s.id !== msg.stroke.id);
          editor.applyRemoteStrokeCommit(msg.stroke);
          break;
        case "stroke-delete":
          editor.applyRemoteStrokeDelete(msg.strokeId);
          break;
        case "shape-commit":
          editor.applyRemoteShapeCommit(msg.shape);
          break;
        case "shape-delete":
          editor.applyRemoteShapeDelete(msg.shapeId);
          break;
        case "text-commit":
          editor.applyRemoteTextCommit(msg.text);
          break;
        case "text-delete":
          editor.applyRemoteTextDelete(msg.pageId, msg.textId);
          break;
        case "clear-page":
          editor.applyRemoteClearPage(msg.pageId);
          break;
        case "image-add":
          editor.applyRemoteImageAdd(msg.image);
          break;
        case "image-update":
          editor.applyRemoteImageUpdate(msg);
          break;
        case "image-delete":
          editor.applyRemoteImageDelete(msg.imageId);
          break;
        case "theme":
          this.viewerHostTheme = msg.themeId;
          break;
        case "grant-edit":
          this.viewerCanEdit = true;
          break;
        case "revoke-edit":
          this.viewerCanEdit = false;
          this.viewerOwnLive = undefined;
          break;
        case "chat":
          this.appendChat(msg);
          break;
        case "chat-history":
          this.mergeChatHistory(msg.messages);
          break;
        case "chat-edit":
          this.applyChatEdit(msg.id, msg.text, msg.editedTs);
          break;
        case "chat-reaction":
          this.applyChatReaction(msg.id, msg.emoji, msg.fromId, msg.op);
          break;
        case "chat-seen":
          this.applyChatSeen(msg.who, msg.name, msg.ts);
          break;
        // viewport / presenter / presenter-off: the viewer keeps its own camera
        // and does not mirror the host's presenter overlay — ignored.
        // session-ended is handled in onMessage before reaching here.
      }
    },
  },
});
