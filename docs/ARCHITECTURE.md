# Cherry Manga Studio architecture

## Runtime boundaries

```text
DOM events -> app/gesture + editor/keyboard controllers
           -> typed editor actions / transactions
           -> versioned RuntimeState
              |-> ProjectRepository (IndexedDB + metadata fallback)
              |-> AssetRepository (IndexedDB blobs)
              `-> RasterRepository (IndexedDB snapshots)

RuntimeState -> editor/view (DOM preview)
             `-> export renderer (PNG/JPG/PDF/CBZ/ZIP/Webtoon)
```

`MangaProject` is the JSON-serializable domain document. It owns Volume → Chapter → Page hierarchy, the unified element/raster layer order, document metadata and reusable text styles. Browser `File`, `Blob`, object URL and data URL values are not persisted in project JSON. `ImageElement.assetId` points to an `MangaAsset`; `src` is a runtime-only rendering URL.

## Editor modules

- `src/main.ts` bootstraps the editor and routes high-level DOM events.
- `src/app/gestures.ts` owns pointer capture and one-transaction move, crop, resize, rotate, pan, snapping and navigator gestures.
- `src/editor/keyboard.ts` maps keyboard input to typed command callbacks and keeps shortcuts out of text fields.
- `src/editor/state.ts` owns runtime state, transaction snapshots, undo/redo and persistence scheduling.
- `src/editor/actions.ts`, `hierarchy.ts`, `document.ts`, `panels.ts`, `raster-actions.ts` and `text-actions.ts` contain testable document mutations.
- `src/editor/interactions.ts`, `transforms.ts` and `typography.ts` contain pure coordinate, selection, geometry and auto-fit calculations.
- `src/editor/view.ts` renders HTML from state and does not own project mutations.
- `src/editor/raster.ts` replays full-resolution raster operations; `src/export.ts` renders the same layer order into downloadable formats.

A pointer drag calls `checkpoint()` once at pointer-down and persists once at pointer-up, so pointer moves do not flood history. Project schema migration currently normalizes legacy documents to `PROJECT_SCHEMA_VERSION` 6, including hierarchy, raster layers, exact pixel-span selections, transform defaults, typography, multiple balloon tails, reusable text styles and typed image/font assets.

## Panel, selection and raster model

- `parentId` makes an image a true child of a panel. The DOM clips it inside the panel container and export applies the same panel path before drawing it.
- Crop state is normalized source-space `{ x, y, scale, left, top, width, height }`. Double-click enters crop mode; eight handles edit the crop without moving its panel.
- `selectedIds` supports Shift-click and marquee multi-selection. Snapping candidates include page edges/center and non-selected element edges/centers. Guides are transient runtime state.
- `MangaPage.rasterLayers` and `layerOrder` form one low-to-high stack shared by editor, inspector, archive and export.
- Raster strokes are replayable Canvas commands. They support geometric and contiguous selections, fill/erase, alpha lock, optional masks, manga tones/effect lines, deterministic local retouch filters and moving the latest stroke to a new layer.
- Browser guardrails reject unsafe full-resolution canvas dimensions with a readable Thai error instead of crashing the tab.
- Thai/Latin word segmentation and basic Japanese kinsoku wrapping live in `typography.ts`, so auto-fit and exported lettering make the same line-break decisions.

## Persistence and integration

`ProjectRepository`, `AssetRepository` and `RasterRepository` are stable typed boundaries. IndexedDB is the browser implementation; a local metadata fallback and in-memory binary repositories keep unsupported/offline environments explicit. Legacy localStorage data URLs are migrated into the asset repository during initialization. Validated TTF/OTF/WOFF assets use the same binary repository, are registered through `FontFace`, and travel inside `.cherrymanga` archives.

`.cherrymanga` is a validated ZIP archive containing versioned `project.json`, asset blobs and raster snapshots. Import validates paths, entry sizes, CRC checksums and supported schema before replacing editor state.

`src/integrations/cherrydeskx.ts` defines SSO, Workspace, Asset, revision and AI job contracts. The HTTP adapter is constructed only when `VITE_ENABLE_CHERRYDESKX_API=true`; default local mode never fabricates a cloud or AI success.

## Export boundary

The exporter walks hierarchy order and the same unified layer order as the editor. PNG can preserve alpha. JPG/PDF/CBZ default to a configurable opaque background. ZIP and Webtoon support full hierarchy scope; Webtoon creates a long strip when browser limits permit and always creates bounded slices. The job runner is typed and cancellable. ZIP/CBZ/PDF byte packaging runs in a short-lived Web Worker and terminates immediately on cancellation; Canvas/font/image composition remains on the main thread until the renderer can move safely to OffscreenCanvas or a server.
