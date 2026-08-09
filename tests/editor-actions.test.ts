import { describe, expect, it } from "vitest";
import { alignSelected, clamp, distributeSelected, duplicateSelected, getCropRect, groupSelected, resetImageEdits, setCropRect } from "../src/editor/actions";
import { runtime, selectedElements, setSelection } from "../src/editor/state";
import { createImage, createPanel, createText } from "../src/sample";
import type { MangaProject } from "../src/types";

function testProject(): MangaProject {
  const page = {
    id: "page",
    name: "หน้า 1",
    width: 800,
    height: 1000,
    background: "#fff",
    volumeId: "volume",
    chapterId: "chapter",
    order: 0,
    thumbnailVersion: 1,
    elements: [createPanel("panel", 0, 0, 800, 1000), createText("A", 20, 50, 100, 50), createText("B", 280, 200, 100, 50), createText("C", 600, 350, 100, 50)],
    rasterLayers: [],
    layerOrder: [],
  };
  return { id: "project", name: "Test", schemaVersion: 4, readingDirection: "ltr", pagePreset: "custom", dpi: 300, colorMode: "rgb", bleed: 0, trim: 0, safeArea: 30, gutter: 16, activePageId: page.id, activeChapterId: "chapter", activeVolumeId: "volume", volumes: [{ id: "volume", name: "เล่ม 1", chapterIds: ["chapter"], order: 0 }], chapters: [{ id: "chapter", volumeId: "volume", name: "บทที่ 1", pageIds: [page.id], order: 0 }], pages: [page], assets: [], createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" };
}

describe("editor actions", () => {
  it("clamps values and aligns a multi-selection", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    runtime.project = testProject();
    setSelection(runtime.project.pages[0]!.elements.slice(1).map((element) => element.id));
    alignSelected("left");
    const selected = selectedElements();
    expect(selected.every((element) => element.x === 20)).toBe(true);
  });

  it("distributes three selected elements by their visual order", () => {
    runtime.project = testProject();
    const elements = runtime.project.pages[0]!.elements.slice(1);
    setSelection(elements.map((element) => element.id));
    distributeSelected("horizontal");
    expect(elements[1]!.x).toBeGreaterThan(elements[0]!.x);
    expect(elements[2]!.x).toBeGreaterThan(elements[1]!.x);
  });

  it("expands a grouped element selection so transforms keep the group together", () => {
    runtime.project = testProject();
    const elements = runtime.project.pages[0]!.elements.slice(1, 3);
    setSelection(elements.map((element) => element.id));
    groupSelected();
    setSelection([elements[0]!.id]);
    expect(selectedElements().map((element) => element.id)).toEqual(elements.map((element) => element.id));
  });

  it("resets image editing values without changing its placement", () => {
    const project = testProject();
    const image = createImage("รูป", "blob:test", 90, 120, 200, 180);
    image.grayscale = 75;
    image.contrast = 180;
    image.crop = { x: 0.1, y: 0.9, scale: 2.5, left: 0.1, top: 0.2, width: 0.4, height: 0.5 };
    image.flipX = true;
    project.pages[0]!.elements.push(image);
    runtime.project = project;
    setSelection([image.id]);
    resetImageEdits();
    expect(image.x).toBe(90);
    expect(image.y).toBe(120);
    expect(image.grayscale).toBe(0);
    expect(image.contrast).toBe(100);
    expect(image.crop).toEqual({ x: 0.5, y: 0.5, scale: 1, left: 0, top: 0, width: 1, height: 1 });
    expect(image.flipX).toBe(false);
  });

  it("stores a bounded crop selection as normalized source coordinates", () => {
    const project = testProject();
    const image = createImage("รูป", "blob:test", 0, 0, 300, 200);
    project.pages[0]!.elements.push(image);
    runtime.project = project;
    setSelection([image.id]);
    setCropRect(image, { left: 0.2, top: 0.15, width: 0.5, height: 0.6 });
    expect(getCropRect(image)).toEqual({ left: 0.2, top: 0.15, width: 0.5, height: 0.6 });
    expect(image.crop.x).toBe(0.45);
    expect(image.crop.y).toBeCloseTo(0.45);
  });

  it("duplicates a panel with its clipped image and remaps the parent ID", () => {
    const project = testProject();
    const page = project.pages[0]!;
    const panel = page.elements[0]!;
    const image = createImage("รูปในช่อง", "blob:test", 12, 18, 200, 180);
    image.parentId = panel.id;
    page.elements.push(image);
    runtime.project = project;
    setSelection([panel.id]);
    duplicateSelected();
    const clonedPanel = page.elements.find((element) => element.kind === "panel" && element.id !== panel.id);
    const clonedImage = page.elements.find((element) => element.kind === "image" && element.id !== image.id);
    expect(clonedPanel).toBeDefined();
    expect(clonedImage?.parentId).toBe(clonedPanel?.id);
    expect(clonedImage?.x).toBe(image.x);
    expect(clonedImage?.y).toBe(image.y);
  });
});
