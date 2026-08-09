import { describe, expect, it } from "vitest";
import { contentAwareFillPixels, MAX_LOCAL_CONTENT_AWARE_PIXELS } from "../src/editor/content-aware";

describe("local content-aware fill", () => {
  it("propagates boundary colour into the selected mask and respects alpha lock", () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    for (let index = 0; index < 9; index += 1) {
      const offset = index * 4;
      pixels[offset] = index < 4 ? 30 : 210;
      pixels[offset + 1] = 80;
      pixels[offset + 2] = 120;
      pixels[offset + 3] = 255;
    }
    const centerOffset = (1 * 3 + 1) * 4;
    pixels[centerOffset] = 255;
    pixels[centerOffset + 1] = 0;
    pixels[centerOffset + 2] = 0;
    pixels[centerOffset + 3] = 77;
    const selection = { mode: "rectangle" as const, points: [], x: 1, y: 1, width: 1, height: 1 };
    expect(contentAwareFillPixels(pixels, 3, 3, selection, 1, true)).toBe(1);
    expect(pixels[centerOffset]).toBeLessThan(255);
    expect(pixels[centerOffset + 1]).toBe(80);
    expect(pixels[centerOffset + 3]).toBe(77);
  });

  it("rejects selections above the local browser guardrail", () => {
    const pixels = new Uint8ClampedArray(4);
    const selection = { mode: "rectangle" as const, points: [], x: 0, y: 0, width: MAX_LOCAL_CONTENT_AWARE_PIXELS + 1, height: 1 };
    expect(contentAwareFillPixels(pixels, 1, 1, selection)).toBe(0);
  });
});
