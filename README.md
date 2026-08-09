# Cherry Manga Studio

A functional browser editor for arranging, decorating, resizing, stretching, rotating and exporting manga pages under the CherryDeskX product family.

**Target:** `https://manga.cherrydeskx.com`

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
- Grayscale, contrast and corner-radius controls.
- Layer selection, visibility, locking and ordering.
- Add, duplicate, switch and delete pages.
- Undo, redo, autosave and keyboard nudging.
- Grid and publishing safe-area overlays.
- Smart Layout that arranges existing images deterministically.
- Export the active page as a native 2× PNG.
- Local browser persistence, Docker image and CI build.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

## Build

```bash
npm run typecheck
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
├── main.ts       Editor state, UI rendering and interactions
├── export.ts     Native Canvas PNG renderer
├── sample.ts     Starter project, element factories and original demo art
├── styles.css    Complete responsive editor design
└── types.ts      Project, page, asset and element contracts
```

The document model is JSON serializable. A later backend can persist the same `MangaProject` shape in PostgreSQL or object storage while keeping the editor behavior intact.

## Current storage model

The prototype saves project JSON and uploaded image data in browser `localStorage`. Large image collections can exceed browser quotas. Production should use CherryDeskX authentication, an API database and S3-compatible object storage.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Product roadmap

See [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).
