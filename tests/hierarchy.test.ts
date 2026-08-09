import { describe, expect, it } from "vitest";
import {
  addProjectChapter,
  addProjectVolume,
  cloneHierarchyPage,
  duplicateProjectVolume,
  normalizeProjectHierarchy,
  reorderProjectPages,
  reorderProjectVolumes,
} from "../src/editor/hierarchy";
import { runtime } from "../src/editor/state";
import { createImage, createPanel, createStarterProject } from "../src/sample";

describe("project hierarchy commands", () => {
  it("starts with real clipped panel children instead of visually stacked loose images", () => {
    const project = createStarterProject();
    for (const page of project.pages) {
      const images = page.elements.filter((element) => element.kind === "image");
      expect(images.length).toBeGreaterThan(0);
      expect(images.every((image) => page.elements.some((element) => element.kind === "panel" && element.id === image.parentId))).toBe(true);
    }
  });

  it("creates a usable first chapter and page for every new volume", () => {
    runtime.project = createStarterProject();
    const previousVolumeCount = runtime.project.volumes.length;
    addProjectVolume();
    const volume = runtime.project.volumes.find((candidate) => candidate.id === runtime.project.activeVolumeId);
    const chapter = runtime.project.chapters.find((candidate) => candidate.id === runtime.project.activeChapterId);
    const page = runtime.project.pages.find((candidate) => candidate.id === runtime.project.activePageId);
    expect(runtime.project.volumes).toHaveLength(previousVolumeCount + 1);
    expect(volume?.chapterIds).toEqual([chapter?.id]);
    expect(chapter?.pageIds).toEqual([page?.id]);
    expect(page).toMatchObject({ volumeId: volume?.id, chapterId: chapter?.id, order: 0 });
    expect(page?.elements.filter((element) => element.kind === "panel")).toHaveLength(3);
  });

  it("clones panel children, groups, and raster IDs without retaining cross-page identity", () => {
    const project = createStarterProject();
    const source = project.pages[0]!;
    const panel = { ...createPanel("ช่อง", 20, 20, 300, 400), id: "panel-source", groupId: "group-source" };
    const image = { ...createImage("ภาพ", "blob:test", 8, 8, 280, 380), id: "image-source", parentId: panel.id, groupId: "group-source" };
    source.elements = [panel, image];
    source.layerOrder = [panel.id, image.id];
    const clone = cloneHierarchyPage(source, source.volumeId, source.chapterId, "สำเนา");
    const clonedPanel = clone.elements.find((element) => element.kind === "panel");
    const clonedImage = clone.elements.find((element) => element.kind === "image");
    expect(clonedPanel?.id).not.toBe(panel.id);
    expect(clonedImage?.parentId).toBe(clonedPanel?.id);
    expect(clonedImage?.groupId).toBe(clonedPanel?.groupId);
    expect(clonedImage?.groupId).not.toBe("group-source");
  });

  it("duplicates and drag-reorders hierarchy while keeping canonical arrays in sync", () => {
    runtime.project = createStarterProject();
    const originalVolumeId = runtime.project.activeVolumeId;
    expect(duplicateProjectVolume()).toBe(true);
    const copiedVolumeId = runtime.project.activeVolumeId;
    expect(copiedVolumeId).not.toBe(originalVolumeId);
    expect(reorderProjectVolumes(copiedVolumeId, originalVolumeId)).toBe(true);
    expect(runtime.project.volumes[0]?.id).toBe(copiedVolumeId);

    const targetPageId = runtime.project.pages.find((page) => page.volumeId === originalVolumeId)?.id;
    addProjectChapter();
    const movingPageId = runtime.project.activePageId;
    expect(targetPageId).toBeDefined();
    expect(reorderProjectPages(movingPageId, targetPageId ?? "missing")).toBe(true);
    const target = runtime.project.pages.find((page) => page.id === targetPageId);
    const moved = runtime.project.pages.find((page) => page.id === movingPageId);
    expect(moved?.chapterId).toBe(target?.chapterId);
    expect(moved?.volumeId).toBe(target?.volumeId);
    normalizeProjectHierarchy(runtime.project);
    expect(new Set(runtime.project.pages.map((page) => page.id)).size).toBe(runtime.project.pages.length);
  });
});
