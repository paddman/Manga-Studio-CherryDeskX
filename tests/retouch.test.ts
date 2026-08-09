import { describe, expect, it } from "vitest";
import { applyRetouchPixels } from "../src/editor/retouch";

function opaquePixels(values: readonly number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));
}

describe("local retouch engine", () => {
  it("applies blur inside the brush and respects an exact selection", () => {
    const pixels = opaquePixels([
      0, 0, 0,
      0, 255, 0,
      0, 0, 0,
    ]);
    const changed = applyRetouchPixels(pixels, 3, 3, {
      preset: "blur",
      points: [{ x: 1.5, y: 1.5, pressure: 1 }],
      size: 5,
      opacity: 1,
      selection: { mode: "pixels", points: [], x: 1, y: 1, width: 1, height: 1, spans: [{ x: 1, y: 1, width: 1 }] },
    });
    expect(changed).toBe(1);
    expect(pixels[16]).toBeLessThan(255);
    expect(pixels[0]).toBe(0);
  });

  it("supports tonal and red-eye corrections without changing alpha", () => {
    const pixels = new Uint8ClampedArray([200, 40, 35, 128, 80, 100, 120, 255]);
    applyRetouchPixels(pixels, 2, 1, { preset: "red-eye", points: [{ x: 0.5, y: 0.5, pressure: 1 }], size: 3, opacity: 1 });
    expect(pixels[0]).toBeLessThan(200);
    expect(pixels[3]).toBe(128);
    const beforeDodge = pixels[4] ?? 0;
    applyRetouchPixels(pixels, 2, 1, { preset: "dodge", points: [{ x: 1.5, y: 0.5, pressure: 1 }], size: 2, opacity: 1 });
    expect(pixels[4]).toBeGreaterThan(beforeDodge);
    expect(pixels[7]).toBe(255);
  });
});
