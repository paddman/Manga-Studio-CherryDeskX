// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/editor/view";
import { runtime, setSelection } from "../src/editor/state";
import { createStarterProject } from "../src/sample";
import { createGestureController, pagePosition } from "../src/app/gestures";

function mountEditor(): HTMLElement {
  document.body.innerHTML = `<div id="app">${renderApp()}</div>`;
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("editor root missing");
  return app;
}

describe("production editor DOM interactions", () => {
  beforeEach(() => {
    runtime.project = createStarterProject();
    runtime.preferences.cropElementId = null;
    runtime.cropSession = null;
    runtime.preferences.tool = "select" as typeof runtime.preferences.tool;
    setSelection([]);
    document.body.innerHTML = "";
  });

  it("opens a grouped toolbox section and exposes canonical ready tools", () => {
    const app = mountEditor();
    const transformGroup = [...app.querySelectorAll<HTMLDetailsElement>(".tool-group")].find((group) => group.querySelector("summary")?.textContent?.includes("Transform"));
    expect(transformGroup).toBeDefined();
    expect(transformGroup?.open).toBe(false);
    transformGroup?.querySelector<HTMLElement>("summary")?.click();
    expect(transformGroup?.open).toBe(true);
    const freeTransform = transformGroup?.querySelector<HTMLButtonElement>('[data-tool="free-transform"]');
    expect(freeTransform?.disabled).toBe(false);
    expect(freeTransform?.textContent).toContain("แปลงอิสระ");
  });

  it("renders a readable Thai-first tool palette with quick actions and status metadata", () => {
    const app = mountEditor();
    expect(app.querySelector(".toolbox-header")?.textContent).toContain("เครื่องมือ");
    expect(app.querySelectorAll(".quick-tool")).toHaveLength(8);
    expect(app.querySelector('[data-tool="brush"] .quick-tool-icon')?.textContent).toBe("●");
    expect(app.querySelector('[data-tool="brush"] kbd')?.textContent).toBe("B");

    const selectionGroup = [...app.querySelectorAll<HTMLDetailsElement>(".tool-group")].find((group) => group.querySelector("summary")?.textContent?.includes("เลือกพื้นที่"));
    expect(selectionGroup?.querySelector(".tool-group-name")?.textContent).toContain("Selection");
    const marquee = selectionGroup?.querySelector<HTMLButtonElement>('[data-tool="rectangular-marquee"]');
    expect(marquee?.querySelector(".tool-entry-meta em")?.textContent).toBe("พร้อมใช้");
    expect(marquee?.querySelector("kbd")?.textContent).toBe("M");
  });

  it("opens the group that contains the active tool", () => {
    runtime.preferences.tool = "brush" as typeof runtime.preferences.tool;
    const app = mountEditor();
    const drawingGroup = [...app.querySelectorAll<HTMLDetailsElement>(".tool-group")].find((group) => group.querySelector("summary")?.textContent?.includes("วาดเส้นและลงสี"));
    expect(drawingGroup?.open).toBe(true);
    expect(drawingGroup?.querySelector('[data-tool="brush"]')?.classList.contains("is-active")).toBe(true);
  });

  it("keeps adapter tools non-interactive and explains the missing backend", () => {
    const app = mountEditor();
    const selectSubject = app.querySelector<HTMLButtonElement>('[data-tool="select-subject"]');
    expect(selectSubject?.disabled).toBe(true);
    expect(selectSubject?.classList.contains("capability-adapter")).toBe(true);
    expect(selectSubject?.title).toContain("segmentation model");
    expect(selectSubject?.title).toContain("AI Selection");
  });

  it("renders eight real crop handles only while the selected image is in crop mode", () => {
    const image = runtime.project.pages[0]!.elements.find((element) => element.kind === "image");
    if (!image) throw new Error("starter image missing");
    setSelection([image.id]);
    runtime.preferences.cropElementId = image.id;
    const app = mountEditor();
    const cropElement = app.querySelector<HTMLElement>(`[data-element-id="${image.id}"]`);
    expect(cropElement?.classList.contains("is-crop-mode")).toBe(true);
    expect(cropElement?.querySelectorAll("[data-crop-resize]")).toHaveLength(8);
    expect(cropElement?.querySelector("[data-crop-move]")).not.toBeNull();
    expect(cropElement?.querySelector("[data-crop-draw]")).not.toBeNull();
    expect(cropElement?.querySelector("[data-resize]")).toBeNull();
    expect(cropElement?.querySelector(".crop-source-preview img")?.getAttribute("style")).toContain("object-fit:fill");
    expect(app.querySelector('[data-action="paste-crop"]')?.textContent).toContain("ตัดแล้ววางเป็นรูปใหม่");
  });

  it("captures a crop pointer gesture as one bounded document interaction", () => {
    const image = runtime.project.pages[0]!.elements.find((element) => element.kind === "image");
    if (!image || image.kind !== "image") throw new Error("starter image missing");
    const app = mountEditor();
    const node = app.querySelector<HTMLElement>(`[data-element-id="${image.id}"]`);
    if (!node) throw new Error("image node missing");
    const rerender = vi.fn();
    const controller = createGestureController({
      pagePoint: (event) => ({ x: event.clientX, y: event.clientY, pressure: event.pressure || 1 }),
      render: vi.fn(),
      rerender,
    });
    controller.beginCropResize(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 7 }), image, node, "nw");
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: image.width * 0.2, clientY: image.height * 0.25, pointerId: 7 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 }));
    expect(image.crop.left).toBeCloseTo(0.2);
    expect(image.crop.top).toBeCloseTo(0.25);
    expect(image.crop.width).toBeCloseTo(0.8);
    expect(image.crop.height).toBeCloseTo(0.75);
    expect(rerender).toHaveBeenCalledWith("เลือกพื้นที่ Crop แล้ว");
  });

  it("draws a new crop rectangle directly on the darkened image area", () => {
    const image = runtime.project.pages[0]!.elements.find((element) => element.kind === "image");
    if (!image || image.kind !== "image") throw new Error("starter image missing");
    setSelection([image.id]);
    runtime.preferences.cropElementId = image.id;
    const app = mountEditor();
    const node = app.querySelector<HTMLElement>(`[data-element-id="${image.id}"]`);
    if (!node) throw new Error("image node missing");
    const position = pagePosition(image);
    const rerender = vi.fn();
    const controller = createGestureController({
      pagePoint: (event) => ({ x: event.clientX, y: event.clientY, pressure: event.pressure || 1 }),
      render: vi.fn(),
      rerender,
    });
    controller.beginCropDraw(new PointerEvent("pointerdown", { clientX: position.x + image.width * 0.1, clientY: position.y + image.height * 0.2, pointerId: 9 }), image, node);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: position.x + image.width * 0.65, clientY: position.y + image.height * 0.75, pointerId: 9 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9 }));

    expect(image.crop.left).toBeCloseTo(0.1);
    expect(image.crop.top).toBeCloseTo(0.2);
    expect(image.crop.width).toBeCloseTo(0.55);
    expect(image.crop.height).toBeCloseTo(0.55);
    expect(rerender).toHaveBeenCalledWith("เลือกกรอบตัดรูปแล้ว");
  });
});
