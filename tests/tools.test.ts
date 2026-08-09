import { describe, expect, it } from "vitest";
import { BRUSH_PRESETS, TOOL_CATALOG, TOOL_DEFINITIONS, isRasterTool, toolId } from "../src/editor/tools";

describe("Photoshop-style tool catalog", () => {
  it("keeps every catalog entry uniquely addressable with an explicit capability", () => {
    const ids = TOOL_CATALOG.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(150);
    expect(TOOL_DEFINITIONS.every((tool) => tool.id && tool.labelTh && tool.labelEn)).toBe(true);
    expect(TOOL_DEFINITIONS.filter((tool) => tool.capability === "disabled" || tool.capability === "adapter").every((tool) => Boolean(tool.reason && tool.phase))).toBe(true);
  });

  it("maps real drawing tools to parameterized brush engines", () => {
    expect(isRasterTool(toolId("brush"))).toBe(true);
    expect(isRasterTool(toolId("rectangle"))).toBe(true);
    expect(isRasterTool(toolId("select-subject"))).toBe(false);
    expect(BRUSH_PRESETS["watercolor-brush"]?.engine).toBe("watercolor");
    expect(BRUSH_PRESETS["hard-eraser"]?.engine).toBe("eraser");
  });
});
