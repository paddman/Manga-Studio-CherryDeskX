# Cherry Manga Studio

A functional browser editor for arranging, decorating, resizing, stretching, rotating and exporting manga pages under the CherryDeskX product family.

**Target:** [`https://manga.cherrydeskx.com`](https://manga.cherrydeskx.com)

## What already works

- Multi-page manga project with a polished editor workspace.
- Upload PNG, JPG, WEBP and SVG artwork.
- Reuse imported artwork from the asset panel.
- Apply one-, two-, three- and four-panel page layouts.
- Add custom panels, titles, text and speech bubbles.
- Drag elements anywhere on the page.
- Resize freely or preserve aspect ratio.
- Rotate elements, with 15-degree snapping while holding Shift.
- Edit exact X, Y, width, height, rotation and opacity values.
- Image fit modes: cover, contain and stretch.
- Panel clipping with child images, crop mode, crop position and crop zoom.
- Shift multi-select, selection rectangle, snapping guides, alignment and distribution.
- Grayscale, contrast and corner-radius controls.
- Layer selection, visibility, locking and ordering.
- Add, duplicate, switch and delete pages.
- Undo, redo, autosave and keyboard nudging.
- Grid and publishing safe-area overlays.
- Smart Layout that arranges existing images deterministically.
- Volume, chapter and page hierarchy with page ordering metadata.
- PNG, JPG, PDF, CBZ, ZIP and split Webtoon export, plus `.cherrymanga` project archives.
- IndexedDB binary asset storage with a local metadata fallback, migration and recovery-safe autosave.
- Typed CherryDeskX SSO, Workspace, Project and AI job adapters. Remote calls stay disabled until explicitly enabled with `VITE_ENABLE_CHERRYDESKX_API=true`.
- Local browser persistence, Docker image and CI build/test validation.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

## Build

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## Docker

```bash
docker compose up -d --build
```

Open `http://localhost:8088`. Health check: `http://localhost:8088/healthz`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `V` | Select tool |
| `H` | Hand / pan tool |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + S` | Save locally |
| `Ctrl/Cmd + D` | Duplicate selected element |
| `Delete` / `Backspace` | Delete selected element |
| Arrow keys | Move selected element by 1 px |
| Shift + Arrow keys | Move selected element by 10 px |
| Shift while resizing | Preserve aspect ratio |
| Shift while rotating | Snap to 15 degrees |

## Architecture

The MVP deliberately uses framework-free TypeScript and DOM APIs. This keeps the interaction layer small, makes the repository easy to deploy as static files, and avoids forcing a UI framework before the editor model stabilizes.

```text
src/
├── editor/       Actions, state/history, templates and DOM rendering
├── persistence/  IndexedDB repositories, schema migration and .cherrymanga archive
├── integrations/ Typed CherryDeskX SSO, workspace, revision and AI contracts
├── security/     File signature checks and SVG sanitization
├── export.ts     Canvas renderer and PNG/JPG/PDF/CBZ/ZIP/Webtoon pipeline
├── main.ts       Event wiring and editor bootstrap
├── sample.ts     Starter project, element factories and original demo art
├── styles.css    Responsive editor design
└── types.ts      Versioned project, hierarchy, asset and element contracts
```

The document model is JSON serializable and versioned. Binary assets are deliberately excluded from serialized project JSON and stored through the `AssetRepository` interface.

## Current storage model

Project metadata is persisted through `ProjectRepository` in IndexedDB, with a localStorage metadata fallback when IndexedDB is unavailable. Uploaded binary assets are stored through `AssetRepository`; legacy data URLs are migrated on the next initialization. The remote CherryDeskX adapter is typed but disabled by default, so the editor never reports a fake cloud save.

Project files use `.cherrymanga`: a store-only ZIP containing `project.json` and `assets/<asset-id>`. PNG/JPG export is page scoped by default; PDF, CBZ and Webtoon use the active chapter, while ZIP uses the whole project.

Copy `.env.example` to `.env` when preparing CherryDeskX integration. No token or secret belongs in Vite source, localStorage or project archives.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Product roadmap

See [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).
