import { describe, expect, it } from "vitest";
import { geometryBounds, rotateGeometries, scaleGeometries, type TransformGeometry } from "../src/editor/transforms";

const items: TransformGeometry[] = [
  { id: "a", x: 10, y: 20, width: 100, height: 50, rotation: 0 },
  { id: "b", x: 210, y: 120, width: 80, height: 60, rotation: 10 },
];

describe("multi-element transform geometry", () => {
  it("scales placement and size around one shared selection bounds", () => {
    const source = geometryBounds(items);
    expect(source).toEqual({ x: 10, y: 20, width: 280, height: 160 });
    const scaled = scaleGeometries(items, source!, { x: 20, y: 40, width: 560, height: 320 });
    expect(scaled[0]).toMatchObject({ x: 20, y: 40, width: 200, height: 100 });
    expect(scaled[1]).toMatchObject({ x: 420, y: 240, width: 160, height: 120, rotation: 10 });
  });

  it("rotates all selected centers around the shared center and preserves spacing", () => {
    const rotated = rotateGeometries(items, { x: 150, y: 100 }, 90);
    expect(rotated[0]?.rotation).toBe(90);
    expect(rotated[1]?.rotation).toBe(100);
    const firstCenter = { x: rotated[0]!.x + rotated[0]!.width / 2, y: rotated[0]!.y + rotated[0]!.height / 2 };
    expect(firstCenter.x).toBeCloseTo(205);
    expect(firstCenter.y).toBeCloseTo(10);
  });

  it("returns no bounds for an empty selection", () => {
    expect(geometryBounds([])).toBeNull();
  });
});
