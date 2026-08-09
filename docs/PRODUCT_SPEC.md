# Cherry Manga Studio — Product Specification

## Product statement

Cherry Manga Studio is a browser-based visual editor for composing manga, comics and vertical webtoons. It sits under the CherryDeskX product family and is designed to share identity, storage, AI credits and project context with the parent workspace in later phases.

## Primary jobs

1. Import existing artwork and arrange it into manga panels.
2. Move, resize, stretch, crop, rotate and layer visual elements.
3. Add dialogue, captions, sound effects and multiple speech-bubble styles.
4. Manage a project as volumes, chapters and pages rather than isolated images.
5. Export pages in publishing-friendly formats.
6. Use AI as an assistant for layout, repair, outpainting and continuity, not as an irreversible black box.

## MVP included in this repository

- Responsive editor shell with dark CherryDeskX visual language.
- Multi-page project model.
- Local browser persistence.
- Image upload and reusable asset library.
- Panel templates and custom panel creation.
- Move, free resize, aspect-locked resize and rotation.
- Text, title and six bubble variants with multiple tails.
- Element properties and layer controls.
- Undo and redo history.
- Safe-area and grid overlays.
- Deterministic Smart Layout.
- Native 2× PNG export.
- True panel clipping with crop mode and crop position.
- Multi-select, snapping guides, align/distribute, grouping and flip transforms.
- Volume, chapter and page creation, duplication, drag reorder and cross-chapter page moves.
- Publishing page presets and custom dimensions with DPI, color mode, bleed, trim, safe-area and gutter metadata.
- PNG/JPG/PDF/CBZ/ZIP/Webtoon exports, transparent PNG support and validated `.cherrymanga` import/export.
- IndexedDB asset repository with versioned migration.
- Photoshop-style tool registry with a typed engine/keymap binding. A tool is enabled only when its interaction engine exists; unavailable local/cloud tools have explicit disabled/adapter states.
- Unified page layer metadata with raster layers, alpha lock, selection masks, split-stroke layers and IndexedDB bitmap snapshots.
- Local contiguous flood fill/erase, parameterized brushes, panel cutting, tones, manga effect lines and exact pixel selections.
- Vertical text, typography parity between text/balloons, auto-fit, reusable style presets, multiple positionable balloon tails, validated embedded font assets and basic Japanese kinsoku wrapping.
- Rotate Canvas, Navigator and multi-selection free transform/scale/rotate/skew interactions.
- Docker and Nginx deployment files.
- GitHub Actions build validation.

## Production Editor Foundation status

The current branch implements the local-first foundation for the items above. Cloud identity, remote project revisions, signed asset delivery and AI jobs remain typed adapters with explicit disabled states until their CherryDeskX services are available. The full tool catalog is visible in the editor, while only tools with real local behavior are enabled; local approximations are labeled experimental.

## Remaining production phases

- Authentication and shared CherryDeskX workspace.
- Cloud project storage, object storage and asset deduplication.
- Autosave revisions and collaborative editing.
- Collaborative editing and server-side revision conflict handling.
- Signed asset upload/download and server-side export workers.
- Font subsetting/licence inspection, full JIS X 4051 line composition and advanced SFX lettering.
- Advanced vector paths, complete rulers and server/worker-backed high-resolution export.

## AI phase

- Script-to-page parser.
- Layout recommendations with editable alternatives.
- Face-aware crop and dialogue-safe composition.
- Inpainting, outpainting and background extension.
- Character reference profiles and consistency scoring.
- Translation and re-lettering for Thai, English and Japanese.
- Human approval and per-operation credit reporting.

## Proposed service boundaries

```text
manga.cherrydeskx.com        Web editor
api.cherrydeskx.com          API gateway
identity.cherrydeskx.com     SSO / OIDC
assets.cherrydeskx.com       Object storage delivery
ai.cherrydeskx.com           AI jobs and model routing
```

The current MVP intentionally runs without a backend. The editor model is shaped so local persistence can later be replaced by API persistence without rewriting the visual interaction layer.
