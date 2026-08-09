import { describe, expect, it } from "vitest";
import { canUseTool, DEFAULT_TOOL_KEYMAP, resolveToolShortcut, TOOL_CATALOG, TOOL_DEFINITIONS, toolId } from "../src/editor/tools";

describe("typed tool registry", () => {
  it("has one unique definition for every canonical catalog entry", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(TOOL_CATALOG.length);
    expect(new Set(TOOL_DEFINITIONS.map((tool) => tool.id)).size).toBe(TOOL_DEFINITIONS.length);
    expect(TOOL_DEFINITIONS.every((tool) => tool.labelTh && tool.labelEn && tool.group)).toBe(true);
  });

  it("never enables a tool without a registered interaction engine", () => {
    const enabled = TOOL_DEFINITIONS.filter((tool) => canUseTool(tool.id));
    expect(enabled.length).toBeGreaterThan(20);
    expect(enabled.every((tool) => tool.engine !== undefined)).toBe(true);
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "magic-wand")?.capability).toBe("disabled");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "paint-bucket")?.engine).toBe("raster-bucket");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "magic-eraser")?.engine).toBe("raster-bucket-erase");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "select-subject")?.capability).toBe("adapter");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "rotate-canvas")?.engine).toBe("viewport-rotate");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "navigator")?.engine).toBe("viewport-navigator");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "free-transform")?.engine).toBe("element-free-transform");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "scale")?.engine).toBe("element-scale");
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === "skew")?.capability).toBe("experimental");
  });

  it("resolves the standard keymap and supports a typed custom keymap", () => {
    expect(resolveToolShortcut("b")).toBe(toolId("brush"));
    expect(resolveToolShortcut("M")).toBe(toolId("rectangular-marquee"));
    expect(resolveToolShortcut("r")).toBe(toolId("rotate-canvas"));
    expect(resolveToolShortcut("?")).toBeNull();
    expect(resolveToolShortcut("q", { ...DEFAULT_TOOL_KEYMAP, Q: toolId("g-pen") })).toBe(toolId("g-pen"));
    expect(resolveToolShortcut("q", { Q: toolId("magic-wand") })).toBeNull();
  });
});
