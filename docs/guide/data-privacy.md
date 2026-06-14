---
title: Data & Privacy
description: How DrawShare stores data locally and what that means for your privacy.
---

# Data & Privacy

DrawShare is designed around a single principle: **your data belongs to you**. No information is ever sent to a remote server.

## Where Data Lives

All project data — strokes, page names, settings — is stored in your browser's **IndexedDB**. This is a private, sandboxed storage area that no other website or application can read.

| What | Where stored |
|------|-------------|
| Projects and pages | Browser IndexedDB |
| Strokes and drawings | Browser IndexedDB |
| App preferences | Browser `localStorage` |
| Session (live sharing) data | RAM only — never persisted |

## No Accounts

DrawShare has no sign-up, no login, and no user profile. There is nothing to create and nothing to forget.

## No Cloud Sync

Data does not leave your device unless you explicitly export it. There is no background sync, no automatic backup to any cloud service.

## No Telemetry

DrawShare collects zero analytics, crash reports, or usage metrics.

## Clearing Site Data

If you clear your browser's site data (cookies, cache, IndexedDB) for the DrawShare origin, **all projects are permanently deleted**. There is no recovery path unless you have an exported backup.

To protect against accidental loss:

1. Open the project settings.
2. Choose **Export JSON** to download a full backup.
3. Store the file somewhere safe (e.g. a local folder or external drive).

## Restoring a Backup

To restore an exported backup:

1. Open DrawShare.
2. Click **Import Project** on the home screen.
3. Select your `.json` backup file.

The project and all its pages are restored exactly as they were when you exported.

## Live Sharing & Privacy

When you use Live Sharing, drawing data is transmitted directly to viewer devices over WebRTC on your local network. This data:

- Is **not** routed through any external server.
- Is **not** persisted on viewer devices (viewers see a read-only live view).
- Is **not** recorded or logged anywhere.

Signaling metadata (ICE candidates) used to establish the WebRTC connection passes through an in-process relay but contains no canvas data.
