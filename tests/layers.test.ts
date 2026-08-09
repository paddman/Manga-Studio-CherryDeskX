import { describe, expect, it } from "vitest";
import { movePageLayer, normalizePageLayerOrder, orderedPageLayers } from "../src/editor/layers";
import { createPanel, createText } from "../src/sample";
import type { MangaPage, RasterLayer } from "../src/types";

function makePage(): MangaPage {
  const panel = { ...createPanel("ช่อง", 0, 0, 800, 1000), id: "panel" };
  const text = { ...createText("ข้อความ", 20, 30, 120, 60), id: "text" };
  const raster: RasterLayer = {
    id: "raster",
    kind: "raster",
    name: "หมึก",
    width: 800,
    height: 1000,
    opacity: 1,
    hidden: false,
    locked: false,
    alphaLock: false,
    blendMode: "source-over",
    strokes: [],
  };
  return {
    id: "page",
    name: "หน้า 1",
    width: 800,
    height: 1000,
    background: "#fff",
    elements: [panel, text],
    rasterLayers: [raster],
    layerOrder: [panel.id, "removed-layer", raster.id],
    volumeId: "volume",
    chapterId: "chapter",
    order: 0,
    thumbnailVersion: 1,
  };
}

describe("unified page layers", () => {
  it("normalizes stale layer IDs and includes every raster and element", () => {
    const page = makePage();
    expect(normalizePageLayerOrder(page)).toEqual(["panel", "raster", "text"]);
    expect(orderedPageLayers(page).map((layer) => `${layer.kind}:${layer.id}`)).toEqual([
      "panel:panel",
      "raster:raster",
      "text:text",
    ]);
  });

  it("moves raster layers through element layers in one stack", () => {
    const page = makePage();
    expect(movePageLayer(page, "raster", 1)).toBe(true);
    expect(page.layerOrder).toEqual(["panel", "text", "raster"]);
    expect(movePageLayer(page, "raster", 1)).toBe(false);
    expect(movePageLayer(page, "raster", -1)).toBe(true);
    expect(page.layerOrder).toEqual(["panel", "raster", "text"]);
  });
});
