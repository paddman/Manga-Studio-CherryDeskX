import { describe, expect, it } from "vitest";
import { renderApp } from "../src/editor/view";
import { addRasterLayer, selectRasterLayer } from "../src/editor/raster-actions";
import { runtime, setSelection } from "../src/editor/state";
import { createStarterProject } from "../src/sample";

describe("editor smoke render", () => {
  it("renders the Thai editor shell with export and hierarchy controls", () => {
    runtime.project = createStarterProject();
    const html = renderApp();
    expect(html).toContain("Cherry Manga Studio");
    expect(html).toContain("data-export-format");
    expect(html).toContain("data-export-scope");
    expect(html).toContain("data-export-scale-mode");
    expect(html).toContain("data-export-include-bleed");
    expect(html).toContain("data-hierarchy-volume");
    expect(html).toContain("data-page-canvas");
    expect(html).toContain("capability-adapter");
    expect(html).toContain("ยังไม่มี AI backend ที่เปิดใช้งาน");
  });

  it("warns clearly when CMYK metadata is selected", () => {
    runtime.project.colorMode = "cmyk";
    const html = renderApp();
    expect(html).toContain("CMYK เป็น metadata เท่านั้น");
    expect(html).toContain("ยังเป็น RGB/sRGB");
  });

  it("renders a selected raster layer in the unified stack with real controls", () => {
    runtime.project = createStarterProject();
    const layer = addRasterLayer("หมึกทดสอบ");
    selectRasterLayer(layer.id);
    const html = renderApp();
    expect(html).toContain(`data-raster-layer-id="${layer.id}"`);
    expect(html).toContain("data-raster-alpha-lock");
    expect(html).toContain("data-action=\"bring-forward\"");
  });

  it("renders production lettering controls for a selected balloon", () => {
    runtime.project = createStarterProject();
    const bubble = runtime.project.pages[0]!.elements.find((element) => element.kind === "bubble");
    if (!bubble) throw new Error("starter bubble missing");
    setSelection([bubble.id]);
    const html = renderApp();
    expect(html).toContain("data-element-prop=\"autoFit\"");
    expect(html).toContain("data-action=\"add-bubble-tail\"");
    expect(html).toContain("data-action=\"save-text-style\"");
    expect(html).toContain("value=\"whisper\"");
    expect(html).toContain("value=\"narration\"");
  });
});
