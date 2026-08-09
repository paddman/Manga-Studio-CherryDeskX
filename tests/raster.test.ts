import { describe, expect, it } from "vitest";
import { floodFillPixels } from "../src/editor/raster";

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

describe("local raster pixel operations", () => {
  it("flood-fills only the contiguous region separated by opaque pixels", () => {
    const width = 5;
    const height = 3;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const offset = pixelOffset(width, 2, y);
      pixels[offset] = 10;
      pixels[offset + 1] = 10;
      pixels[offset + 2] = 10;
      pixels[offset + 3] = 255;
    }

    const changed = floodFillPixels(pixels, width, height, {
      startX: 0,
      startY: 1,
      color: "#ff0000",
      opacity: 1,
      tolerance: 0,
      erase: false,
    });

    expect(changed).toBe(6);
    expect([...pixels.slice(pixelOffset(width, 1, 1), pixelOffset(width, 1, 1) + 4)]).toEqual([255, 0, 0, 255]);
    expect([...pixels.slice(pixelOffset(width, 3, 1), pixelOffset(width, 3, 1) + 4)]).toEqual([0, 0, 0, 0]);
  });

  it("uses the same contiguous engine for background and magic erasing", () => {
    const width = 3;
    const height = 2;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const changed = floodFillPixels(pixels, width, height, {
      startX: 1,
      startY: 1,
      color: "#000000",
      opacity: 1,
      tolerance: 0,
      erase: true,
      selection: {
        mode: "rectangle",
        points: [{ x: 0, y: 0, pressure: 1 }, { x: 1, y: 2, pressure: 1 }],
        x: 0,
        y: 0,
        width: 1,
        height: 2,
      },
    });
    expect(changed).toBe(4);
    expect(pixels[pixelOffset(width, 0, 0) + 3]).toBe(0);
    expect(pixels[pixelOffset(width, 1, 1) + 3]).toBe(0);
    expect(pixels[pixelOffset(width, 2, 1) + 3]).toBe(255);
  });
});
