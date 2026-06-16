---
title: Getting Started
description: Learn how to run DrawShare, open a project, and start drawing.
---

# Getting Started

DrawShare is a local-first collaborative whiteboard that lets you draw freehand and stream your canvas live to any screen on the same network — no accounts, no cloud required.

## Running DrawShare

Clone the repository and install dependencies:

```bash
git clone https://github.com/shravanngoswamii/DrawShare.git
cd DrawShare
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`) in your browser.

To access DrawShare from other devices on your network, use Vite's `--host` flag:

```bash
npm run dev -- --host
```

Vite will print a network URL (e.g. `http://192.168.1.10:5173`) that any device on your local network can open.

## Opening a Project

When you first open DrawShare you land on the project list. Click **New Project** to create one. Projects are stored locally in IndexedDB — they persist across browser restarts with no sign-in required.

To re-open an existing project, click its card on the home screen.

## Drawing

Select a tool from the toolbar (or use [keyboard shortcuts](/guide/keyboard-shortcuts)):

| Tool | Description |
|------|-------------|
| **Pen** | Smooth pressure-sensitive freehand strokes |
| **Highlighter** | Semi-transparent broad strokes |
| **Eraser** | Remove strokes by drawing over them |
| **Text** | Place a text label on the canvas |

Adjust stroke colour and width from the tool options panel at the bottom of the screen.

## Saving

DrawShare saves automatically. Every stroke is written to IndexedDB as it is committed, so you never need to press Save.

## Exporting

Open the page menu and choose **Export PNG** to download the current page as a PNG image.

To export a full project backup (all pages, all strokes), use **Export JSON** from the project settings. You can re-import the JSON file on any device running DrawShare.
