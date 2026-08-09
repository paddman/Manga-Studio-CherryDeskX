# Production Editor Foundation audit

This document records the implemented boundary of the local-first foundation. A catalog entry is not considered usable unless `ToolDefinition.engine` points to an interaction primitive and its capability is `ready` or `experimental`.

| Area | Implemented and verified | Explicit boundary |
| --- | --- | --- |
| Tool architecture | Canonical Thai/English registry for the complete requested catalog, grouped toolbox, shortcuts, ready/experimental/disabled/adapter states | Disabled and adapter tools expose a reason and target phase; they do not dispatch an operation |
| Document | Volume → Chapter → Page create, duplicate, delete and drag reorder; B5/A5/comic/A4/Webtoon/custom presets; publishing metadata | CMYK is document metadata only; browser Canvas remains RGB |
| Panels and images | True parent/child clipping, upload/reuse/replace/detach, cover/contain/stretch, normalized crop, eight crop handles, panel cutter | Perspective crop and content-aware image operations require a later engine |
| Selection and transform | Shift/marquee multi-select, exact contiguous Magic Wand spans, snapping/guides, align/distribute/group, free scale/rotate/flip/skew | Magnetic/semantic selection and perspective/mesh/puppet transforms remain experimental or disabled as labeled |
| Raster | Full-page layers, parameterized brush/eraser/fill/gradient/shape primitives, masks, alpha lock, split latest stroke, tones and effect lines | Several named presets intentionally share a tested raster primitive; vector editing and advanced retouch engines are not emulated |
| Lettering | Horizontal/vertical text, font/weight/alignment/spacing/outline/shadow, auto-fit, reusable style presets, six balloon variants and multiple tails | Font upload/embedding, Japanese kinsoku rules, text-on-path and text warp remain follow-up work |
| Persistence | IndexedDB project/assets/raster repositories, localStorage data-URL migration, schema v5, validated `.cherrymanga` round trip | Cross-device sync and revision conflict handling require CherryDeskX Workspace APIs |
| Export | PNG/JPG/PDF/CBZ/ZIP/Webtoon, page/chapter/volume/project scope, 1×/2×/300-DPI/custom scale, bleed/crop marks, progress and cancellation | Rendering currently runs through a typed inline job runner; worker/server rendering remains an adapter |
| Integrations | Typed SSO, Workspace, Asset, revision and AI interfaces with an environment-gated HTTP adapter | No backend request is made by default and no demo response claims success |
| Verification | Strict typecheck, unit tests, DOM interaction tests, render smoke, archive/export tests, production build and container health check | Full cross-browser visual regression and deployed E2E automation remain follow-up work |

## Browser safety guardrails

Raster and export dimensions are validated before allocating unsafe canvases. Corrupt archives, unsupported schema versions, oversized ZIP entries and invalid image signatures fail with readable errors. PNG may retain alpha; formats without alpha use an explicit background. Project JSON does not persist binary data URLs.
