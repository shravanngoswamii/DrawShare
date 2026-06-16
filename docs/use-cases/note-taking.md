---
title: Personal Note-Taking
description: Use DrawShare as an offline digital notebook with multi-page projects, freehand writing, and PNG export.
---

# Personal Note-Taking

DrawShare works as a lightweight freehand notebook — no internet connection needed, no account to manage. Organise notes across multiple pages inside a project, and export individual pages or a full backup whenever you need to share or archive them.

## Setup

DrawShare works entirely offline once installed as a PWA. On any supported browser:

1. Open DrawShare.
2. Look for the **Install** prompt in the browser's address bar (or browser menu).
3. Install the PWA.

Once installed, DrawShare opens as a standalone app with no address bar and works without a network connection.

## Organising Notes

**Projects** group related notes together — for example, one project per subject, client, or meeting series.

**Pages** within a project let you separate topics without losing the overall context. Use descriptive page names to navigate quickly:

- "Lecture 1 — Intro to Databases"
- "Lecture 2 — Normalisation"
- "Problem Set 3"

Rename a page by tapping its name in the page panel.

## Writing and Drawing

DrawShare is optimised for freehand input:

- **Pen** tool for standard notes and diagrams
- **Highlighter** for emphasis
- **Eraser** for quick corrections
- **Undo** (`Ctrl+Z`) for precise stroke-level corrections

On a tablet with a stylus (iPad + Apple Pencil, Surface + Slim Pen, Android + S-Pen), note-taking feels close to paper.

## Exporting Notes

**Single page as PNG:**

Open the page menu → **Export PNG**. Useful for sharing a single diagram or lesson summary.

**Full project backup as JSON:**

Open project settings → **Export JSON**. This file contains all pages and strokes, and can be re-imported on any device running DrawShare.

## Backup Strategy

Because notes live in the browser's IndexedDB, clearing site data removes everything. Recommended practice:

1. After significant work, export a JSON backup.
2. Keep backups in a folder synced by your preferred cloud storage (iCloud Drive, Google Drive, Dropbox) — DrawShare itself never touches those services.

## Why DrawShare Works for Personal Notes

| Benefit | Detail |
|---------|--------|
| Fully offline | Works without any network after PWA install |
| No subscription | Free, open-source, no lock-in |
| Multi-page | One project per notebook, unlimited pages |
| Fast startup | Loads instantly as a PWA |
| Portable exports | PNG for sharing, JSON for backup and migration |
