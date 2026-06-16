---
title: Live Sharing
description: Stream your DrawShare canvas to viewers on the same local network using WebRTC.
---

# Live Sharing

DrawShare can stream your canvas live to any number of viewers on the same local network. No server account or internet connection is required — the data travels directly between browsers using WebRTC.

## How It Works

When you start a session, DrawShare generates a short **session code** and begins broadcasting:

1. Every stroke you commit is serialised and sent over a WebRTC data channel.
2. Live pointer position is streamed at high frequency so viewers see the pen moving in real time.
3. Page changes are forwarded immediately so viewers follow along.

Signaling (the handshake that lets two browsers find each other) uses a lightweight in-page relay, but **no drawing data ever leaves your local network**.

## Starting a Session (Host)

1. Open a project and navigate to the page you want to share.
2. Click the **Share** button in the toolbar.
3. DrawShare displays a session code (e.g. `DRAW-4821`).
4. Read the code aloud, write it on a whiteboard, or message it to viewers.

You remain in full control of your canvas — viewers cannot draw or modify your work.

## Joining a Session (Viewer)

1. Open DrawShare on any device connected to the same network.
2. Click **Join Session** on the home screen.
3. Enter the session code shared by the host.
4. The host's current canvas loads and updates live.

Viewers do not need an account or any installation beyond a modern browser.

## What Syncs

| Event | Synced |
|-------|--------|
| Committed strokes | Yes |
| Live pointer position | Yes |
| Page switches | Yes |
| Tool selection / colour | No (host's view only) |
| Project name / page names | Yes (on join) |

## Host Controls

- **Pause sharing** — stops sending updates without ending the session.
- **Stop session** — disconnects all viewers and clears the session code.

## Reconnection

If a viewer loses the network connection momentarily, DrawShare attempts to reconnect automatically. When reconnection succeeds, the viewer's canvas is refreshed to match the host's current state.

## Technical Details

- Transport: WebRTC `RTCDataChannel` (ordered, reliable mode for strokes; unreliable mode for pointer events).
- Signaling: A tiny in-browser signaling mechanism; only session metadata (ICE candidates, SDP) passes through it — never canvas data.
- No TURN server is configured by default. Both peers must be on the same LAN or the same machine. If you need cross-network sharing, you can configure a TURN server in the environment variables (see [Self-Hosting](/guide/self-hosting)).
