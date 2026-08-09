import { describe, expect, it } from "vitest";
import { applyPagePreset, resizePageContent, setDocumentMetadata } from "../src/editor/document";
import { runtime } from "../src/editor/state";
import { createStarterProject } from "../src/sample";

describe("document presets and publishing metadata", () => {
  it("resizes element, panel-child, raster, selection, and mask coordinates proportionally", () => {
    const project = createStarterProject();
    const page = project.pages[0]!;
    const element = page.elements[0]!;
    const original = { x: element.x, y: element.y, width: element.width, height: element.height };
    page.rasterLayers.push({
      id: "raster",
      kind: "raster",
      name: "หมึก",
      width: page.width,
      height: page.height,
      opacity: 1,
      hidden: false,
      locked: false,
      alphaLock: false,
      blendMode: "source-over",
      strokes: [{
        id: "stroke",
        kind: "stroke",
        preset: "brush",
        points: [{ x: 10, y: 20, pressure: 1 }],
        color: "#000000",
        size: 8,
        opacity: 1,
        blendMode: "source-over",
        selection: { mode: "rectangle", points: [{ x: 5, y: 6, pressure: 1 }, { x: 15, y: 16, pressure: 1 }], x: 5, y: 6, width: 10, height: 10 },
      }],
      mask: { enabled: true, inverted: false, selection: { mode: "pixels", points: [{ x: 4, y: 8, pressure: 1 }], x: 4, y: 8, width: 2, height: 1, spans: [{ x: 4, y: 8, width: 2 }] } },
    });
    const originalWidth = page.width;
    const originalHeight = page.height;
    resizePageContent(page, originalWidth * 2, originalHeight * 3);
    expect(element).toMatchObject({ x: original.x * 2, y: original.y * 3, width: original.width * 2, height: original.height * 3 });
    expect(page.rasterLayers[0]?.strokes[0]?.points[0]).toMatchObject({ x: 20, y: 60 });
    expect(page.rasterLayers[0]?.strokes[0]?.selection).toMatchObject({ x: 10, y: 18, width: 20, height: 30 });
    expect(page.rasterLayers[0]?.mask?.selection).toMatchObject({ x: 8, y: 24, width: 4, height: 3, spans: [{ x: 8, y: 24, width: 4 }, { x: 8, y: 25, width: 4 }, { x: 8, y: 26, width: 4 }] });
  });

  it("applies production presets and clamps editable metadata", () => {
    runtime.project = createStarterProject();
    expect(applyPagePreset("webtoon")).toBe(true);
    expect(runtime.project.pagePreset).toBe("webtoon");
    expect(runtime.project.pages.find((page) => page.id === runtime.project.activePageId)).toMatchObject({ width: 1080, height: 1920 });
    expect(runtime.project.dpi).toBeLessThanOrEqual(144);
    expect(setDocumentMetadata("dpi", "5000")).toBe(true);
    expect(setDocumentMetadata("bleed", "-5")).toBe(true);
    expect(setDocumentMetadata("colorMode", "cmyk")).toBe(true);
    expect(runtime.project.dpi).toBe(1200);
    expect(runtime.project.bleed).toBe(0);
    expect(runtime.project.colorMode).toBe("cmyk");
    expect(setDocumentMetadata("colorMode", "lab")).toBe(false);
  });
});
