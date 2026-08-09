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
- Text, title and four bubble variants.
- Element properties and layer controls.
- Undo and redo history.
- Safe-area and grid overlays.
- Deterministic Smart Layout.
- Native 2× PNG export.
- True panel clipping with crop mode and crop position.
- Multi-select, snapping guides, align/distribute, grouping and flip transforms.
- Volume, chapter and page metadata with page manager controls.
- PNG/JPG/PDF/CBZ/ZIP/Webtoon exports and `.cherrymanga` import/export.
- IndexedDB asset repository with versioned migration.
- Docker and Nginx deployment files.
- GitHub Actions build validation.

## Production Editor Foundation status

The current branch implements the local-first foundation for the items above. Cloud identity, remote project revisions, signed asset delivery and AI jobs remain typed adapters with explicit disabled states until their CherryDeskX services are available.

## Remaining production phases

- Authentication and shared CherryDeskX workspace.
- Cloud project storage, object storage and asset deduplication.
- Chapter and volume hierarchy.
- Autosave revisions and collaborative editing.
- Collaborative editing and server-side revision conflict handling.
- Signed asset upload/download and server-side export workers.
- Fonts, vertical Japanese text and advanced SFX lettering.
- Snap guides, rulers, groups and reusable styles.

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
