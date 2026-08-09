# Cherry Manga Studio architecture

## Runtime boundaries

```text
DOM events -> editor/tools + editor/actions -> versioned RuntimeState -> ProjectRepository
                                      |                                -> AssetRepository (IndexedDB blobs)
                                      |                                -> RasterRepository (IndexedDB bitmap snapshots)
                                      v
                               editor/view -> DOM canvas
                                      |
                               export.ts -> Canvas / archive formats
```

`MangaProject` is the domain document. It contains volumes, chapters, pages and element metadata, but never depends on a browser `File`, `Blob`, object URL or data URL for persistence. `ImageElement.assetId` points to an `MangaAsset`; `src` is a runtime-only object URL used by the renderer.

## Editor model

- Mutations go through typed actions and `transact()`. A pointer drag calls `checkpoint()` once at pointer-down and saves once at pointer-up, so pointer moves do not create history items.
- `parentId` makes an image a child of a panel. The DOM renders the image inside a clipped panel container; the Canvas exporter applies the same panel path before drawing the child.
- Crop state is `{ x, y, scale, left, top, width, height }` on an image. Double-click enters crop mode and changes the image inside the existing panel/image frame.
- `selectedIds` supports Shift-click and marquee selection. Snapping candidates include page edges/center and non-selected element edges/centers. Guides are transient runtime state and are never exported.
- `MangaPage.rasterLayers` and `layerOrder` extend the existing element stack without invalidating legacy element actions. Raster strokes are replayable Canvas operations and can carry a pixel-selection shape as a clip mask.
- Project schema migration normalizes legacy MVP documents to `PROJECT_SCHEMA_VERSION` 3, including raster-layer defaults, the volume/chapter hierarchy and new element defaults.

## Persistence and integration

`ProjectRepository`, `AssetRepository` and `RasterRepository` are the stable boundaries. IndexedDB is the browser implementation; local metadata, in-memory assets and in-memory raster snapshots are safe fallbacks for unsupported/offline environments. `src/integrations/cherrydeskx.ts` defines SSO, Workspace, typed asset, revision and AI job contracts. The HTTP adapter is only constructed when `VITE_ENABLE_CHERRYDESKX_API=true`; no demo response is fabricated.

## Export

The export pipeline rasterizes the domain page without selection boxes, guides or editor overlays. Raster layers are composited before element rendering, so export matches the editor order currently supported by the unified stack. PNG/JPG are page outputs, PDF embeds page JPEGs, CBZ/ZIP use store-only ZIP entries, Webtoon composes and splits long pages at a configurable height, and `.cherrymanga` includes versioned JSON plus asset/raster binaries for round-trip editing.
