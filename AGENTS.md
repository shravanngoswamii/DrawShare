# DrawShare Agent Guidelines

## Project Overview

Local-first collaborative whiteboard. A teacher draws on an iPad and a viewer laptop renders strokes in real-time over a local network via WebRTC P2P — without screen mirroring lag. Data never passes through a server after the initial peer handshake.

## Architecture

Three strict layers — never import across them in the wrong direction:

```
src/core/        Pure TypeScript. Zero framework or DOM imports. Domain types, port interfaces, sync protocol.
src/adapters/    Platform implementations of core ports (Canvas2D, IndexedDB, PeerJS, PointerInput).
src/stores/      Pinia orchestration. Wires adapters to UI. All side effects live here.
src/components/  Vue UI primitives — stateless or lightly reactive.
src/views/       Routed pages.
```

Core ports defined in `src/core/ports.ts`. Adapters implement those interfaces. Stores own adapter instances at module level.

The `core/` layer is designed to be reusable by a future native iPad app (PencilKit + Metal + Swift). Keep it dependency-free.

## Build and Dev

```bash
npm run dev          # Vite dev server on :5173
npm run build        # vue-tsc type check then Vite bundle
npm run typecheck    # standalone type check only
npm run preview      # preview the dist/ output
```

No test runner. No linter. No pre-commit hooks.

## Code Style

**TypeScript**
- `type` for domain objects and union literals. `interface` only for port contracts (adapters).
- Strict mode: `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`.
- `import type { }` for TypeScript-only imports.
- All cross-module imports use the `@/` alias (maps to `src/`).
- `async/await` throughout. No raw `.then()` chains.

**Vue**
- `<script setup lang="ts">` on every component. No Options API.
- Props: `defineProps<{ }>()`. Emits: `defineEmits<{ }>()`. Always typed.
- `<style scoped>` on every component.
- All `v-for` loops have `:key="id"`.

**CSS**
- All values from design tokens in `src/styles/tokens.css` — spacing (`--space-*`), color (`--color-*`), typography (`--text-*`), radius (`--radius-*`), shadow (`--shadow-*`).
- Global utility classes in `src/styles/base.css`: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.btn-sm`, `.input`, `.muted`, `.subtle`.
- Flexbox-first layout. No CSS frameworks.
- Flat class names. No BEM nesting.

**Pinia Stores**
- `defineStore("name", { state, getters, actions })` pattern.
- State is immutable-first: spread on modification (`[...arr, item]`, `arr.filter(...)`).
- Action names are verbs: `open`, `commit`, `broadcast`, `join`, `stop`.
- Errors surfaced as store state (e.g., `live.error`), not thrown to components.

**Naming**
- Files: camelCase for TS (`pointerInput.ts`), PascalCase for Vue (`CanvasStage.vue`).
- IDs generated with ULID (`src/core/ids.ts`).
- Boolean flags: `isOpen`, `frameQueued`, `dirtyBase`.
- Sync messages discriminated by `t` field (string literal union).

## Conventions That Differ from Common Practice

- **No comments in code.** Self-documenting names only. No JSDoc. No inline explanations.
- **No emojis** anywhere — code, comments, commit messages, files.
- State arrays replaced entirely (spread/filter), never mutated in place.
- Adapters handle their own errors at the boundary. Components never catch.
- `perfect-freehand` smooths stroke points before rendering — raw pointer points are never drawn directly.
- Dual-canvas rendering: base layer (committed strokes, `dirtyBase` flag) + live layer (in-progress stroke, every frame).

## Commit Messages

- One-line summary. State what changed and why. No multi-line body unless essential.
- No conventional-commit prefixes (`feat:`, `fix:`, `chore:`, etc.).
- No Co-Authored-By trailers. No AI attribution.
- Good: `Add incremental stroke-points batching to reduce viewer latency`
- Bad: `feat: update sync` / `Update files`

## Roadmap Context

- **Phase 1 (done):** Single-device editor with autosave, multi-page, local P2P viewer via PeerJS.
- **Phase 2 (planned):** Drive sync (Google Drive and similar, matching draw.io support).
- **Phase 3 (planned):** Native iPad app reusing `src/core/` types via Swift.

Current P2P limitation: PeerJS defaults to the public `0.peerjs.com` signaling server — requires internet for peer discovery even on LAN. Data transfer is direct P2P after handshake. No TURN relay — cross-NAT connections may fail.
