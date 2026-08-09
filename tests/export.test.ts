import { describe, expect, it } from "vitest";
import { backgroundForExport, createPdfDocument, createStoreZip, exportScaleForMode, millimetersToPixels, pagesForScope, planWebtoonSlices, renderedPagePixelSize } from "../src/export";
import { createStarterProject } from "../src/sample";
import { EXPORT_WORKER_CAPABILITY, HybridWorkerExportJobRunner, InlineExportJobRunner } from "../src/export/runner";

describe("export foundations", () => {
  it("applies alpha and opaque background defaults by format", () => {
    expect(backgroundForExport("png", undefined)).toBeUndefined();
    expect(backgroundForExport("png", null)).toBeNull();
    expect(backgroundForExport("jpg", undefined)).toBe("#ffffff");
    expect(backgroundForExport("pdf", "#ffeecc")).toBe("#ffeecc");
    expect(backgroundForExport("cbz", undefined)).toBe("#ffffff");
  });

  it("creates ZIP/CBZ-compatible store archives and a multi-page PDF", async () => {
    const zip = createStoreZip([{ name: "pages/001.png", data: Uint8Array.of(1, 2, 3) }]);
    expect([...new Uint8Array(await zip.slice(0, 4).arrayBuffer())]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const project = createStarterProject();
    const page = project.pages[0]!;
    const jpeg = new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)], { type: "image/jpeg" });
    const pdf = await createPdfDocument([
      { page, blob: jpeg, width: page.width, height: page.height },
      { page: { ...page, id: "page-two" }, blob: jpeg, width: page.width, height: page.height },
    ]);
    const header = new TextDecoder().decode(await pdf.slice(0, 8).arrayBuffer());
    expect(header).toContain("%PDF-1.4");
    expect(new TextDecoder().decode(await pdf.arrayBuffer())).toContain("/Count 2");
  });

  it("plans Webtoon slices and resolves page export scopes", () => {
    expect(planWebtoonSlices([1000, 1800, 1200, 900], 3000)).toEqual([
      { parts: [{ pageIndex: 0, sourceY: 0, height: 1000 }, { pageIndex: 1, sourceY: 0, height: 1800 }, { pageIndex: 2, sourceY: 0, height: 200 }], height: 3000 },
      { parts: [{ pageIndex: 2, sourceY: 200, height: 1000 }, { pageIndex: 3, sourceY: 0, height: 900 }], height: 1900 },
    ]);
    expect(planWebtoonSlices([6500], 3000).map((slice) => slice.height)).toEqual([3000, 3000, 500]);
    const project = createStarterProject();
    expect(pagesForScope(project, "page")).toHaveLength(1);
    expect(pagesForScope(project, "project")).toHaveLength(project.pages.length);
    project.pages.reverse();
    expect(pagesForScope(project, "chapter").map((page) => page.id)).toEqual(project.chapters[0]?.pageIds);
  });

  it("resolves export scale modes and print-layout pixel bounds", () => {
    expect(exportScaleForMode("1x", 7, 300)).toBe(1);
    expect(exportScaleForMode("2x", 7, 300)).toBe(2);
    expect(exportScaleForMode("300dpi", 7, 150)).toBe(2);
    expect(exportScaleForMode("custom", 20, 300)).toBe(8);
    expect(millimetersToPixels(25.4, 300)).toBeCloseTo(300);
    const page = createStarterProject().pages[0]!;
    const plain = renderedPagePixelSize(page, 1);
    const print = renderedPagePixelSize(page, 1, { bleedMm: 3, dpi: 300, includeBleed: true, cropMarks: true });
    expect(plain).toEqual({ width: page.width, height: page.height });
    expect(print.width).toBeGreaterThan(plain.width);
    expect(print.height).toBeGreaterThan(plain.height);
  });

  it("exposes an honest hybrid worker boundary with an inline fallback", () => {
    expect(new InlineExportJobRunner().execution).toBe("inline");
    expect(new HybridWorkerExportJobRunner().execution).toBe("hybrid-worker");
    expect(EXPORT_WORKER_CAPABILITY).toMatchObject({ status: "experimental" });
    expect(EXPORT_WORKER_CAPABILITY.reason).toContain("main thread");
  });
});
