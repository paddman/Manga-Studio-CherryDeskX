# Cherry Manga Studio architecture

## Runtime boundaries

```text
DOM events -> editor/actions -> versioned RuntimeState -> ProjectRepository
                                      |                 -> AssetRepository (IndexedDB blobs)
                                      v
                               editor/view -> DOM canvas
                                      |
                               export.ts -> Canvas / archive formats
```

`MangaProject` is the domain document. It contains volumes, chapters, pages and element metadata, but never depends on a browser `File`, `Blob`, object URL or data URL for persistence. `ImageElement.assetId` points to an `MangaAsset`; `src` is a runtime-only object URL used by the renderer.

## Editor model

- Mutations go through typed actions and `transact()`. A pointer drag calls `checkpoint()` once at pointer-down and saves once at pointer-up, so pointer moves do not create history items.
- `parentId` makes an image a child of a panel. The DOM renders the image inside a clipped panel container; the Canvas exporter applies the same panel path before drawing the child.
- Crop state is `{ x, y, scale }` on an image. Double-click enters crop mode and changes the image inside the existing panel/image frame.
- `selectedIds` supports Shift-click and marquee selection. Snapping candidates include page edges/center and non-selected element edges/centers. Guides are transient runtime state and are never exported.
- Project schema migration normalizes legacy MVP documents to `PROJECT_SCHEMA_VERSION` 2, including the volume/chapter hierarchy and new element defaults.

## Persistence and integration

`ProjectRepository` and `AssetRepository` are the stable boundaries. IndexedDB is the browser implementation; local metadata and in-memory assets are safe fallbacks for unsupported/offline environments. `src/integrations/cherrydeskx.ts` defines SSO, Workspace, revision and AI job contracts. The HTTP adapter is only constructed when `VITE_ENABLE_CHERRYDESKX_API=true`; no demo response is fabricated.

## Export

The export pipeline rasterizes the domain page without selection boxes, guides or editor overlays. PNG/JPG are page outputs, PDF embeds page JPEGs, CBZ/ZIP use store-only ZIP entries, Webtoon composes and splits long pages at a configurable height, and `.cherrymanga` includes versioned JSON plus asset binaries for round-trip editing.
