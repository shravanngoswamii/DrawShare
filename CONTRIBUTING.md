# Contributing to DrawShare

Thanks for your interest in contributing! DrawShare is a local-first collaborative drawing app built with Vue 3, TypeScript, and Pinia.

## Getting started

**Prerequisites:** Node.js 22+, npm.

```bash
git clone https://github.com/shravanngoswamii/DrawShare.git
cd DrawShare
npm install
npm run dev          # start the dev server (http://localhost:5173)
```

Before your first commit, Lefthook installs itself automatically on `npm install` and runs Biome on staged files. If you want to run the full suite manually:

```bash
npm run check        # Biome lint + format check
npm run format       # auto-fix formatting
npm run typecheck    # TypeScript type check
npm run build        # production build
```

## Code style

- **Formatter / linter:** [Biome](https://biomejs.dev/) — config is in `biome.json`. Run `npm run format` to auto-fix.
- **Pre-commit hook:** [Lefthook](https://github.com/evilmartians/lefthook) via `lefthook.yml` runs Biome on staged files. It is installed automatically via a `postinstall` script.
- **Language:** TypeScript everywhere. No `any` unless there is a documented reason.
- **Components:** Vue 3 `<script setup>` SFC style.
- **State:** Pinia stores in `src/stores/`.
- **No comments** unless the _why_ is non-obvious (hidden constraint, workaround for a specific platform bug, non-intuitive invariant). Good names are preferred over explanatory comments.

## Pull requests

1. Fork the repo and create a branch: `git checkout -b fix/my-fix` or `feat/my-feature`.
2. Keep changes focused — one logical change per PR.
3. Make sure `npm run check` and `npm run typecheck` pass before pushing.
4. Open the PR against `main`. The CI will run typecheck, Biome, and a security audit automatically.
5. If your PR closes an issue, add `Closes #N` in the description.

A PR preview deploy is posted automatically as a comment so you can test the live build.

## Reporting bugs

Use the [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml) issue template. Include:
- Steps to reproduce
- Device + browser + OS
- Expected vs. actual behaviour
- Console errors if any

## Suggesting features

Use the [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml) template. Describe the problem first, then the solution.

## Project structure

```
src/
  adapters/      # Platform-specific: IndexedDB storage, Canvas 2D renderer, pointer input
  components/    # Vue components (Toolbar, CanvasStage, PagesPanel, …)
  core/          # Pure domain types and ports (no framework dependencies)
  stores/        # Pinia stores (editor, projects, live session)
  views/         # Route-level views
  styles/        # CSS design tokens and base styles
```

## Code of Conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
