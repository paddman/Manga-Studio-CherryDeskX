import { describe, expect, it } from "vitest";
import { addRasterLayer, applyPixelSelectionAsLayerMask, invertRasterLayerMask, recordRasterStroke, splitLastStrokeToLayer } from "../src/editor/raster-actions";
import { activePage, runtime } from "../src/editor/state";
import { createStarterProject } from "../src/sample";

describe("raster layer actions", () => {
  it("records alpha-lock state and splits the latest stroke into the next layer", () => {
    runtime.project = createStarterProject();
    const source = addRasterLayer("หมึก");
    source.alphaLock = true;
    recordRasterStroke({
      id: "stroke-test",
      kind: "stroke",
      preset: "g-pen",
      points: [{ x: 20, y: 30, pressure: 1 }, { x: 40, y: 60, pressure: 1 }],
      color: "#000000",
      size: 8,
      opacity: 1,
      blendMode: "source-over",
    });
    expect(source.strokes[0]?.preserveAlpha).toBe(true);

    const split = splitLastStrokeToLayer();
    expect(split?.strokes).toHaveLength(1);
    expect(source.strokes).toHaveLength(0);
    expect(activePage().layerOrder.indexOf(split?.id ?? "missing")).toBe(activePage().layerOrder.indexOf(source.id) + 1);
    expect(runtime.preferences.activeRasterLayerId).toBe(split?.id);

    runtime.pixelSelection = { mode: "rectangle", points: [{ x: 0, y: 0, pressure: 1 }, { x: 100, y: 100, pressure: 1 }], x: 0, y: 0, width: 100, height: 100 };
    expect(applyPixelSelectionAsLayerMask()).toBe(true);
    expect(split?.mask?.selection.width).toBe(100);
    expect(invertRasterLayerMask()).toBe(true);
    expect(split?.mask?.inverted).toBe(true);
  });
});
