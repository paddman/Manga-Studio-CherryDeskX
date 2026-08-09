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
- `MangaPage.rasterLayers` and `layerOrder` form one low-to-high stack for editor rendering, inspector ordering and export. Panel children remain scoped to their clipping container.
- Raster strokes are replayable Canvas operations. They support geometric pixel selections, contiguous flood fill/erase, alpha-preserving paint, optional selection masks and moving the latest stroke to a new layer.
- Pointer interactions use pointer capture, one history checkpoint per gesture and pure coordinate/selection helpers. `DEFAULT_TOOL_KEYMAP` maps standard shortcuts and can be replaced by a typed custom map later.
- Project schema migration normalizes legacy MVP documents to `PROJECT_SCHEMA_VERSION` 3, including raster-layer defaults, the volume/chapter hierarchy and new element defaults.

## Persistence and integration

`ProjectRepository`, `AssetRepository` and `RasterRepository` are the stable boundaries. IndexedDB is the browser implementation; local metadata, in-memory assets and in-memory raster snapshots are safe fallbacks for unsupported/offline environments. `src/integrations/cherrydeskx.ts` defines SSO, Workspace, typed asset, revision and AI job contracts. The HTTP adapter is only constructed when `VITE_ENABLE_CHERRYDESKX_API=true`; no demo response is fabricated.

## Export

The export pipeline walks the same unified layer order as the editor and excludes selection boxes, guides and editor overlays. PNG can omit the page background for alpha; JPG/PDF/CBZ default to white and accept a chosen background. PDF embeds page JPEGs, CBZ/ZIP use store-only ZIP entries, and Webtoon slices can split inside an oversized page without dropping pixels. `.cherrymanga` includes versioned JSON plus asset/raster binaries and validates entry paths, sizes, CRC checksums and schema compatibility on import.
