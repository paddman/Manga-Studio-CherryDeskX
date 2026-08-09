import { describe, expect, it } from "vitest";
import { createStarterProject } from "../src/sample";
import { MemoryAssetRepository } from "../src/persistence/repository";
import { exportProjectBundle, importProjectBundle } from "../src/persistence/archive";
import { migrateProject, serializeProject } from "../src/persistence/serialization";

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
    expect(project.schemaVersion).toBe(2);
    expect(project.pages[0]?.elements[0]?.kind).toBe("image");
    expect(json).not.toContain("data:image");
    expect(project.pages[0]?.elements[0]?.kind === "image" ? project.pages[0].elements[0].crop.scale : 0).toBe(1);
  });

  it("round-trips a .cherrymanga archive with binary assets", async () => {
    const project = createStarterProject();
    const assets = new MemoryAssetRepository();
    const firstAsset = project.assets[0]!;
    await assets.put(firstAsset.id, new Blob(["binary-image"], { type: firstAsset.mimeType }));
    const archive = await exportProjectBundle(project, assets);
    const imported = await importProjectBundle(archive);
    expect(imported.project.id).toBe(project.id);
    expect(imported.project.pages).toHaveLength(project.pages.length);
    expect(imported.assets.get(firstAsset.id)).toBeDefined();
    expect(await imported.assets.get(firstAsset.id)?.text()).toBe("binary-image");
  });
});
