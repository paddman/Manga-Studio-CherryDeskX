import { describe, expect, it } from "vitest";
import { renderApp } from "../src/editor/view";

describe("editor smoke render", () => {
  it("renders the Thai editor shell with export and hierarchy controls", () => {
    const html = renderApp();
    expect(html).toContain("Cherry Manga Studio");
    expect(html).toContain("data-export-format");
    expect(html).toContain("data-hierarchy-volume");
    expect(html).toContain("data-page-canvas");
  });
});
