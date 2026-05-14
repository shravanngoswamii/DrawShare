# DrawShare

Local-first collaborative whiteboard for streaming live writing from an iPad to a
laptop without screen mirroring. The teacher writes; the laptop renders the
strokes locally as they arrive. No pixel streaming, no AirPlay lag.

This is the **web** implementation (PWA). The architecture is layered so the
domain logic, wire format, and rendering contracts can be reused by a native
iPad app (PencilKit + Metal) later without rewriting the data model or the
laptop viewer.

## Status

Phase 1 — single-device editor with full autosave and project/page management.
Local-network peer sync and Drive sync land in subsequent phases.

## Stack

- Vue 3 + TypeScript + Vite
- Pinia for state, vue-router for navigation
- `perfect-freehand` for stroke smoothing
- `idb` for IndexedDB persistence
- `vite-plugin-pwa` for service worker / installable app

## Architecture

The code is split into three concentric rings:

```
src/
  core/        pure TypeScript domain. zero framework or DOM imports.
    types.ts       wire-format data shapes
    ports.ts       interfaces an adapter must implement
    strokeMath.ts  geometry helpers
    ids.ts         id generation
  adapters/    platform-specific implementations of the ports.
    input/         PointerInputAdapter  (web)
    render/        Canvas2DRenderer     (web)
    storage/       IndexedDBStorage     (web)
  stores/      pinia stores. orchestrate adapters.
  components/  vue UI primitives.
  views/       vue routed pages.
```

To target native iPad later, only `adapters/*` need a Swift implementation
(PencilKit, Metal, CoreData). `core/` is the cross-platform spec.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:5173` in Safari on the iPad (same Wi-Fi as the dev
machine, replace `localhost` with the dev host's LAN IP).

## Build

```sh
npm run build
```

Output goes to `dist/`. The Vite `base` path can be overridden with the
`BASE_PATH` env var so the same artifact deploys under any path.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds with
`BASE_PATH=/<repo-name>/` and publishes the `dist/` output to the `gh-pages`
branch via [`JamesIves/github-pages-deploy-action`](https://github.com/JamesIves/github-pages-deploy-action).

To enable: repo Settings → Pages → Source = "Deploy from a branch", Branch =
`gh-pages` / `(root)`. The workflow needs `contents: write` (already declared).

## Data model

| Type     | Persisted in IndexedDB store | Notes                                  |
|----------|------------------------------|----------------------------------------|
| Project  | `projects`                   | name, pageOrder, timestamps            |
| Page     | `pages` (indexed by project) | size, background, index                |
| Stroke   | `strokes` (indexed by page)  | points: `[{x, y, p, t}]`               |

Every committed stroke is written atomically to the `strokes` store, so a
browser refresh or crash mid-session loses at most the unfinished stroke.

## Keyboard

| Key        | Action       |
|------------|--------------|
| `1`        | Pen          |
| `2`        | Highlighter  |
| `3`        | Eraser       |
| `Cmd/Ctrl+Z` | Undo       |
| `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` | Redo |
