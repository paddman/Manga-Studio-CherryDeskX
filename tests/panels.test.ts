import { describe, expect, it } from "vitest";
import { splitPanelModel } from "../src/editor/panels";
import { createImage, createPanel } from "../src/sample";
import type { MangaPage } from "../src/types";

function panelPage(): MangaPage {
  const panel = { ...createPanel("ช่องหลัก", 100, 120, 600, 400), id: "panel" };
  const left = { ...createImage("ซ้าย", "blob:left", 10, 10, 250, 380), id: "left", parentId: panel.id };
  const right = { ...createImage("ขวา", "blob:right", 340, 10, 250, 380), id: "right", parentId: panel.id };
  return {
    id: "page",
    name: "หน้า",
    width: 800,
    height: 1000,
    background: "#ffffff",
    elements: [panel, left, right],
    rasterLayers: [],
    layerOrder: [panel.id, left.id, right.id],
    volumeId: "volume",
    chapterId: "chapter",
    order: 0,
    thumbnailVersion: 1,
  };
}

describe("panel cutter model", () => {
  it("splits a real panel, preserves style, and reassigns clipped child images", () => {
    const page = panelPage();
    const result = splitPanelModel(page, "panel", "vertical", 0.5, 20);
    expect(result).not.toBeNull();
    expect(page.elements.filter((element) => element.kind === "panel")).toHaveLength(2);
    expect(result?.first.width).toBe(290);
    expect(result?.second.x).toBe(410);
    expect(page.elements.find((element) => element.id === "left")?.parentId).toBe(result?.first.id);
    expect(page.elements.find((element) => element.id === "right")?.parentId).toBe(result?.second.id);
    expect(page.layerOrder.slice(0, 2)).toEqual([result?.first.id, result?.second.id]);
    expect(page.layerOrder).not.toContain("panel");
  });

  it("rejects missing panels without mutating the page", () => {
    const page = panelPage();
    const before = structuredClone(page);
    expect(splitPanelModel(page, "missing", "horizontal", 0.5, 16)).toBeNull();
    expect(page).toEqual(before);
  });
});
