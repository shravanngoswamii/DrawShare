<p align="center">
  <img src="public/favicon.svg" width="96" height="96" alt="DrawShare logo" />
</p>

<h1 align="center">DrawShare</h1>

<p align="center">
  <a href="https://github.com/shravanngoswamii/DrawShare/actions/workflows/code-quality.yml"><img src="https://github.com/shravanngoswamii/DrawShare/actions/workflows/code-quality.yml/badge.svg" alt="Code Quality" /></a>
  <a href="https://github.com/shravanngoswamii/DrawShare/actions/workflows/deploy.yml"><img src="https://github.com/shravanngoswamii/DrawShare/actions/workflows/deploy.yml/badge.svg" alt="Deploy" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Vue-3-42b883.svg" alt="Vue 3" />
  <img src="https://img.shields.io/badge/code_style-Biome-60a5fa.svg" alt="Biome" />
</p>

A local-first collaborative whiteboard. Write with a pen, stylus, or mouse on any device and another screen renders your strokes live over the local network, no screen mirroring or AirPlay lag. Everything is saved on-device, so it works offline too.

Live: https://shravangoswami.com/DrawShare/

## Stack

- Vue 3, TypeScript, Vite
- Pinia for state, vue-router for routing
- `perfect-freehand` for stroke smoothing
- `idb` for IndexedDB persistence
- WebRTC for live sharing
- A small hand-written service worker for offline/PWA support

## Develop

```sh
npm install
npm run dev
```

To draw from another device, open the dev URL with the machine's LAN IP instead of `localhost`, on the same Wi-Fi.

## Build

```sh
npm run build
```

Output goes to `dist/`. The base path can be set with the `BASE_PATH` env var so the same build deploys under any path.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to the `gh-pages` branch. Pull requests get their own preview deploy via `.github/workflows/preview.yml`.

## Data model

| Type    | IndexedDB store      | Notes                        |
|---------|----------------------|------------------------------|
| Project | `projects`           | name, page order, timestamps |
| Page    | `pages` (by project) | size, background, text boxes |
| Stroke  | `strokes` (by page)  | points `[{x, y, p, t}]`      |

Each stroke is written as soon as it is finished, so a refresh or crash loses at most the stroke in progress.

## Shortcuts

| Key | Action |
|-----|--------|
| `1` | Pen |
| `2` | Highlighter |
| `3` | Eraser |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` | Redo |

A Dev Mode toggle in the sidebar opens an on-screen debug terminal, useful on devices without devtools.

## License

MIT, © 2026 Shravan Goswami. See [LICENSE](LICENSE).
