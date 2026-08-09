import { describe, expect, it } from "vitest";
import {
  buildPixelSelection,
  buildContiguousPixelSelection,
  clientToPagePoint,
  clientToRotatedPagePoint,
  isEraserToolId,
  isUsablePixelSelection,
  rasterStrokeKindForToolId,
  selectionModeForToolId,
  rotatedViewportSize,
} from "../src/editor/interactions";
import { rasterDimensionError } from "../src/editor/raster";

describe("editor interactions", () => {
  it("converts pointer coordinates into full-resolution page coordinates", () => {
    expect(clientToPagePoint(
      { clientX: 250, clientY: 350, pressure: 0.4 },
      { left: 50, top: 100, width: 400, height: 500 },
      { width: 800, height: 1000 },
    )).toEqual({ x: 400, y: 500, pressure: 0.4 });

    expect(clientToPagePoint(
      { clientX: -20, clientY: 900, pressure: 0 },
      { left: 0, top: 0, width: 400, height: 500 },
      { width: 800, height: 1000 },
    )).toEqual({ x: 0, y: 1000, pressure: 1 });
  });

  it("inverts a rotated canvas transform for drawing and selection coordinates", () => {
    const bounds = rotatedViewportSize(800, 1000, 0.5, 90);
    expect(bounds.width).toBeCloseTo(500);
    expect(bounds.height).toBeCloseTo(400);
    expect(clientToRotatedPagePoint(
      { clientX: 250, clientY: 250, pressure: 0.7 },
      { left: 0, top: 0, width: 500, height: 400 },
      { width: 800, height: 1000 },
      90,
    )).toMatchObject({ x: 500, y: 500, pressure: 0.7 });
  });

  it("builds normalized rectangular and freehand pixel selections", () => {
    const rectangle = buildPixelSelection("rectangle", [
      { x: 80, y: 90, pressure: 1 },
      { x: 20, y: 30, pressure: 1 },
    ]);
    expect(rectangle).toMatchObject({ x: 20, y: 30, width: 60, height: 60 });
    expect(isUsablePixelSelection(rectangle)).toBe(true);

    const lasso = buildPixelSelection("lasso", [
      { x: 12, y: 25, pressure: 1 },
      { x: 32, y: 9, pressure: 1 },
      { x: 50, y: 40, pressure: 1 },
    ]);
    expect(lasso).toMatchObject({ x: 12, y: 9, width: 38, height: 31 });
    expect(lasso?.points).toHaveLength(3);
  });

  it("builds exact contiguous pixel spans for Magic Wand and Quick Selection", () => {
    const width = 5;
    const height = 3;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const offset = (row * width + 2) * 4;
      pixels[offset] = 255;
      pixels[offset + 3] = 255;
    }
    const selection = buildContiguousPixelSelection(pixels, width, height, 0, 1, 0);
    expect(selection).toMatchObject({ mode: "pixels", x: 0, y: 0, width: 2, height: 3 });
    expect(selection?.spans).toEqual([
      { x: 0, y: 0, width: 2 },
      { x: 0, y: 1, width: 2 },
      { x: 0, y: 2, width: 2 },
    ]);
    expect(isUsablePixelSelection(selection)).toBe(true);
  });

  it("maps selection, shape, fill, and eraser tools to real engine primitives", () => {
    expect(selectionModeForToolId("elliptical-marquee")).toBe("ellipse");
    expect(selectionModeForToolId("selection-pen")).toBe("lasso");
    expect(selectionModeForToolId("magic-wand")).toBeNull();
    expect(rasterStrokeKindForToolId("paint-bucket")).toBe("bucket");
    expect(rasterStrokeKindForToolId("contiguous-fill")).toBe("bucket");
    expect(rasterStrokeKindForToolId("magic-eraser")).toBe("erase-fill");
    expect(rasterStrokeKindForToolId("gradient")).toBe("gradient");
    expect(rasterStrokeKindForToolId("rounded-rectangle")).toBe("rectangle");
    expect(rasterStrokeKindForToolId("screentone")).toBe("fill");
    expect(rasterStrokeKindForToolId("gradient-tone")).toBe("fill");
    expect(rasterStrokeKindForToolId("g-pen")).toBe("stroke");
    expect(isEraserToolId("background-eraser")).toBe(true);
    expect(isEraserToolId("eraser")).toBe(true);
    expect(isEraserToolId("brush")).toBe(false);
    expect(isEraserToolId("tone-scraping")).toBe(true);
  });

  it("rejects unsafe full-resolution raster dimensions with a clear reason", () => {
    expect(rasterDimensionError(794, 1123)).toBeNull();
    expect(rasterDimensionError(20_000, 1000)).toContain("16,384");
    expect(rasterDimensionError(8000, 8000)).toContain("32,000,000");
    expect(rasterDimensionError(Number.NaN, 1000)).toBe("ขนาด Raster ไม่ถูกต้อง");
  });
});
