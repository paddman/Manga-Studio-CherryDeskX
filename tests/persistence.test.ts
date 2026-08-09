import { describe, expect, it } from "vitest";
import { createStarterProject } from "../src/sample";
import { MemoryAssetRepository, MemoryRasterRepository } from "../src/persistence/repository";
import { assertSupportedProjectSchema, exportProjectBundle, importProjectBundle } from "../src/persistence/archive";
import { migrateProject, serializeProject } from "../src/persistence/serialization";
import { validateFontFile, validateImageFile } from "../src/security/files";

describe("project persistence", () => {
  it("migrates the MVP shape and removes image sources from project JSON", () => {
    const legacy = {
      id: "legacy",
      name: "Legacy",
      readingDirection: "rtl",
      activePageId: "page-1",
      pages: [{ id: "page-1", name: "หน้า 1", width: 794, height: 1123, background: "#fff", elements: [{ id: "image-1", kind: "image", name: "ภาพ", x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, locked: false, hidden: false, lockAspect: true, src: "data:image/png;base64,abc", fit: "cover" }] }],
      assets: [{ id: "asset-1", name: "ภาพ", src: "data:image/png;base64,abc", createdAt: "2024-01-01T00:00:00.000Z" }],
    };
    const project = migrateProject(legacy);
    const json = JSON.stringify(serializeProject(project));
    expect(project.schemaVersion).toBe(6);
    expect(project.assets[0]?.kind).toBe("image");
    expect(project.pages[0]?.rasterLayers).toEqual([]);
    expect(project.pages[0]?.elements[0]?.kind).toBe("image");
    expect(project.pages[0]?.elements[0]?.skewX).toBe(0);
    expect(project.pages[0]?.elements[0]?.skewY).toBe(0);
    expect(json).not.toContain("data:image");
    expect(project.pages[0]?.elements[0]?.kind === "image" ? project.pages[0].elements[0].crop.scale : 0).toBe(1);
  });

  it("round-trips a .cherrymanga archive with binary assets", async () => {
    const project = createStarterProject();
    const assets = new MemoryAssetRepository();
    const firstAsset = project.assets[0]!;
    const page = project.pages[0]!;
    const panel = page.elements.find((element) => element.kind === "panel");
    const childImage = page.elements.find((element) => element.kind === "image");
    if (panel && childImage) childImage.parentId = panel.id;
    await assets.put(firstAsset.id, new Blob(["binary-image"], { type: firstAsset.mimeType }));
    const archive = await exportProjectBundle(project, assets);
    const imported = await importProjectBundle(archive);
    expect(imported.project.id).toBe(project.id);
    expect(imported.project.pages).toHaveLength(project.pages.length);
    expect(imported.assets.get(firstAsset.id)).toBeDefined();
    expect(await imported.assets.get(firstAsset.id)?.text()).toBe("binary-image");
    const importedChild = imported.project.pages.flatMap((item) => item.elements).find((element) => element.id === childImage?.id);
    expect(importedChild?.parentId).toBe(panel?.id);
  });

  it("rejects corrupt and future .cherrymanga files with readable errors", async () => {
    await expect(importProjectBundle(new Blob(["not a zip"]))).rejects.toThrow("ไม่ใช่ ZIP");

    const project = createStarterProject();
    const archive = await exportProjectBundle(project, new MemoryAssetRepository());
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const marker = new TextEncoder().encode(`\"schemaVersion\": ${project.schemaVersion}`);
    let markerOffset = -1;
    for (let index = 0; index <= bytes.length - marker.length; index += 1) {
      if (marker.every((value, part) => bytes[index + part] === value)) {
        markerOffset = index;
        break;
      }
    }
    expect(markerOffset).toBeGreaterThan(-1);
    bytes[markerOffset + marker.length - 1] = "9".charCodeAt(0);
    await expect(importProjectBundle(new Blob([bytes]))).rejects.toThrow("checksum");
    expect(() => assertSupportedProjectSchema({ schemaVersion: 99, pages: [{}] })).toThrow("รองรับถึง version 6");
    expect(() => assertSupportedProjectSchema({ schemaVersion: "3", pages: [{}] })).toThrow("schemaVersion");
    expect(() => assertSupportedProjectSchema({ schemaVersion: 6 })).toThrow("ไม่มีหน้ามังงะ");
  });

  it("accepts a real PNG file without relying on its browser MIME value", async () => {
    const file = new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)], "page.PNG", { type: "" });
    await expect(validateImageFile(file)).resolves.toBeUndefined();
  });

  it("round-trips raster metadata and binary snapshot entries", async () => {
    const project = createStarterProject();
    const page = project.pages[0]!;
    const layer = {
      id: "raster-test",
      kind: "raster" as const,
      name: "หมึก",
      width: page.width,
      height: page.height,
      opacity: 1,
      hidden: false,
      locked: false,
      alphaLock: false,
      blendMode: "source-over" as const,
      bitmapKey: "project/page/raster-test",
      mask: { enabled: true, inverted: false, selection: { mode: "ellipse" as const, points: [{ x: 0, y: 0, pressure: 1 }, { x: 40, y: 30, pressure: 1 }], x: 0, y: 0, width: 40, height: 30 } },
      strokes: [{ id: "stroke-1", kind: "bucket" as const, preset: "paint-bucket", points: [{ x: 2, y: 3, pressure: 1 }], color: "#000", size: 5, opacity: 1, blendMode: "source-over" as const, preserveAlpha: true, tolerance: 18 }],
    };
    page.rasterLayers.push(layer);
    page.layerOrder.push(layer.id);
    const assets = new MemoryAssetRepository();
    const rasters = new MemoryRasterRepository();
    await rasters.put(layer.bitmapKey, new Blob(["raster-png"], { type: "image/png" }));
    const archive = await exportProjectBundle(project, assets, rasters);
    const imported = await importProjectBundle(archive);
    expect(imported.project.pages[0]?.rasterLayers[0]?.strokes[0]?.preset).toBe("paint-bucket");
    expect(imported.project.pages[0]?.rasterLayers[0]?.strokes[0]?.kind).toBe("bucket");
    expect(imported.project.pages[0]?.rasterLayers[0]?.strokes[0]?.tolerance).toBe(18);
    expect(imported.project.pages[0]?.rasterLayers[0]?.mask?.selection.mode).toBe("ellipse");
    expect(imported.project.pages[0]?.rasterLayers[0]?.strokes[0]?.preserveAlpha).toBe(true);
    expect(await imported.rasters.get(layer.bitmapKey)?.text()).toBe("raster-png");
  });

  it("migrates exact pixel-span selections without widening them into a rectangle", () => {
    const project = createStarterProject();
    const page = project.pages[0]!;
    page.rasterLayers.push({
      id: "pixel-mask",
      kind: "raster",
      name: "Pixel mask",
      width: page.width,
      height: page.height,
      opacity: 1,
      hidden: false,
      locked: false,
      alphaLock: false,
      blendMode: "source-over",
      strokes: [],
      mask: { enabled: true, inverted: false, selection: { mode: "pixels", points: [{ x: 4, y: 8, pressure: 1 }], x: 4, y: 8, width: 7, height: 2, spans: [{ x: 4, y: 8, width: 2 }, { x: 9, y: 9, width: 2 }] } },
    });
    const migrated = migrateProject(serializeProject(project));
    expect(migrated.pages[0]?.rasterLayers[0]?.mask?.selection).toMatchObject({
      mode: "pixels",
      spans: [{ x: 4, y: 8, width: 2 }, { x: 9, y: 9, width: 2 }],
    });
  });

  it("migrates typography v5 fields and saved style presets", () => {
    const project = createStarterProject();
    const bubble = project.pages[0]!.elements.find((element) => element.kind === "bubble");
    if (!bubble || bubble.kind !== "bubble") throw new Error("starter bubble missing");
    bubble.variant = "whisper";
    bubble.fontFamily = "Noto Sans Thai, sans-serif";
    bubble.autoFit = true;
    bubble.tails.push({ id: "tail-extra", x: 30, y: 160 });
    project.textStyles.push({ id: "style-1", name: "กระซิบ", kind: "bubble", fontFamily: bubble.fontFamily, fontSize: 28, fontWeight: 700, color: "#17131f", align: "center", lineHeight: 1.3, letterSpacing: 1, writingMode: "horizontal", outlineColor: "#000000", outlineWidth: 1, shadowColor: "#000000", shadowBlur: 2, background: "#ffffff", borderColor: "#17131f", borderWidth: 4 });
    const migrated = migrateProject(serializeProject(project));
    const migratedBubble = migrated.pages[0]!.elements.find((element) => element.id === bubble.id);
    expect(migrated.schemaVersion).toBe(6);
    expect(migratedBubble).toMatchObject({ variant: "whisper", fontFamily: "Noto Sans Thai, sans-serif", autoFit: true });
    expect(migratedBubble?.kind === "bubble" ? migratedBubble.tails : []).toHaveLength(2);
    expect(migrated.textStyles[0]).toMatchObject({ id: "style-1", kind: "bubble", background: "#ffffff" });
  });

  it("validates and round-trips an embedded font asset", async () => {
    const fontBytes = Uint8Array.of(0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0);
    const fontFile = new File([fontBytes], "MangaThai.woff2", { type: "application/octet-stream" });
    await expect(validateFontFile(fontFile)).resolves.toBeUndefined();
    await expect(validateFontFile(new File([Uint8Array.of(0, 0, 0, 0)], "fake.woff2"))).rejects.toThrow("file signature");

    const project = createStarterProject();
    project.assets.push({ id: "font-1", kind: "font", name: fontFile.name, src: "blob:font-1", mimeType: "font/woff2", byteSize: fontFile.size, width: 0, height: 0, fontFamily: "Cherry MangaThai", createdAt: "2026-08-09T00:00:00.000Z" });
    const assets = new MemoryAssetRepository();
    await assets.put("font-1", fontFile);
    const imported = await importProjectBundle(await exportProjectBundle(project, assets));
    expect(imported.project.assets.find((asset) => asset.id === "font-1")).toMatchObject({ kind: "font", fontFamily: "Cherry MangaThai" });
    expect(await imported.assets.get("font-1")?.arrayBuffer()).toEqual(await fontFile.arrayBuffer());
  });
});
