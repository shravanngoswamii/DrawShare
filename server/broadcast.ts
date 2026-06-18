/**
 * DrawShare broadcast relay server.
 *
 * Architecture:
 *   Host  → ws://<server>/host/<CODE>   (one per room)
 *   Viewer→ ws://<server>/view/<CODE>   (unlimited read-only viewers)
 *
 * The server fans out every message from the host to all connected viewers.
 * It also buffers the full catch-up state so viewers who join mid-session
 * immediately receive the current whiteboard state and then live updates.
 *
 * Catch-up buffer strategy:
 *   - The server caches the latest "hello" message (full project snapshot).
 *   - All messages after the hello are held in a delta buffer (up to MAX_DELTA).
 *   - When a viewer joins, they receive: hello + buffered deltas + live stream.
 *   - When a new "hello" arrives (host restart or reconnect), the buffer resets.
 *
 * Scaling:
 *   For a single instance this handles thousands of concurrent viewers.
 *   Horizontal scaling can be added by replacing the in-process room map with
 *   a Redis pub/sub layer: hosts publish to a channel, viewers subscribe.
 *
 * Environment variables:
 *   PORT          — listening port (default: 3099)
 *   MAX_VIEWERS   — max simultaneous viewers per room (default: 10000)
 *   MAX_DELTA     — max buffered messages after hello (default: 2000)
 *   ALLOWED_ORIGIN— CORS origin for the health endpoint (default: *)
 */

import { createServer, type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 3099);
const MAX_VIEWERS = Number(process.env.MAX_VIEWERS ?? 10_000);
const MAX_DELTA = Number(process.env.MAX_DELTA ?? 2_000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

interface Room {
  host: WebSocket | undefined;
  viewers: Set<WebSocket>;
  // Snapshot of the latest "hello" message for catch-up on join.
  helloSnapshot: string | undefined;
  // All messages received after the last hello, replayed to late joiners.
  delta: string[];
}

const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  let room = rooms.get(code);
  if (!room) {
    room = { host: undefined, viewers: new Set(), helloSnapshot: undefined, delta: [] };
    rooms.set(code, room);
  }
  return room;
}

function cleanupRoom(code: string): void {
  const room = rooms.get(code);
  if (room && !room.host && room.viewers.size === 0) rooms.delete(code);
}

function broadcast(room: Room, raw: string): void {
  for (const viewer of room.viewers) {
    if (viewer.readyState === WebSocket.OPEN) viewer.send(raw);
  }
}

// HTTP server — health check endpoint only.
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const role = parts[0]; // "host" or "view"
  const code = parts[1]?.toUpperCase();

  if (!code || (role !== "host" && role !== "view")) {
    ws.close(4000, "invalid path — use /host/<CODE> or /view/<CODE>");
    return;
  }

  const room = getRoom(code);

  if (role === "host") {
    if (room.host) {
      ws.close(4001, "room already has an active host");
      return;
    }

    room.host = ws;

    // Tell the host the relay is ready and how many viewers are already waiting.
    ws.send(JSON.stringify({ t: "broadcast-ready", viewerCount: room.viewers.size }));

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      const raw = data.toString();

      // Parse to detect hello (snapshot reset) vs delta message.
      try {
        const msg = JSON.parse(raw) as { t: string };
        if (msg.t === "hello") {
          // New snapshot — clear the delta buffer.
          room.helloSnapshot = raw;
          room.delta = [];
        } else if (room.helloSnapshot && room.delta.length < MAX_DELTA) {
          room.delta.push(raw);
        }
      } catch {
        // Ignore malformed messages — still fan them out.
      }

      broadcast(room, raw);
    });

    ws.on("close", () => {
      room.host = undefined;
      // Notify all viewers that the broadcast has ended.
      const endMsg = JSON.stringify({ t: "broadcast-host-left" });
      for (const viewer of room.viewers) {
        if (viewer.readyState === WebSocket.OPEN) viewer.send(endMsg);
      }
      cleanupRoom(code);
    });
  } else {
    // Viewer.
    if (room.viewers.size >= MAX_VIEWERS) {
      ws.close(4003, "room is at capacity");
      return;
    }

    room.viewers.add(ws);

    // Catch-up: replay the snapshot + all buffered deltas so the viewer sees
    // the current state immediately, regardless of when they joined.
    if (room.helloSnapshot) {
      ws.send(room.helloSnapshot);
      for (const msg of room.delta) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    }

    // Tell the host a viewer joined.
    if (room.host?.readyState === WebSocket.OPEN) {
      room.host.send(JSON.stringify({ t: "broadcast-viewer-join", count: room.viewers.size }));
    }

    ws.on("close", () => {
      room.viewers.delete(ws);
      if (room.host?.readyState === WebSocket.OPEN) {
        room.host.send(JSON.stringify({ t: "broadcast-viewer-leave", count: room.viewers.size }));
      }
      cleanupRoom(code);
    });
  }
});

server.listen(PORT, () => {
  console.log(`DrawShare broadcast relay listening on :${PORT}`);
});

// Graceful shutdown.
process.on("SIGTERM", () => {
  server.close();
  wss.close();
  process.exit(0);
});
