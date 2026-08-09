import { describe, expect, it } from "vitest";
import { renderApp } from "../src/editor/view";
import { addRasterLayer, selectRasterLayer } from "../src/editor/raster-actions";
import { runtime } from "../src/editor/state";
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
    expect(html).toContain("ต้องเชื่อม backend หรือ engine ภายนอกก่อน");
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
});
