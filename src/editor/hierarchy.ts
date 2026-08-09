import { PAGE_HEIGHT, PAGE_WIDTH, uid } from "../sample";
import type { MangaChapter, MangaElement, MangaPage, MangaProject, MangaVolume } from "../types";
import { normalizePageLayerOrder } from "./layers";
import { runtime, setSelection, transact } from "./state";
import { getTemplatePanels } from "./templates";

export function createHierarchyPage(volumeId: string, chapterId: string, order: number, name?: string): MangaPage {
  const page: MangaPage = {
    id: uid("page"),
    name: name ?? `หน้า ${order + 1}`,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background: "#f7f5fb",
    elements: [],
    rasterLayers: [],
    layerOrder: [],
    volumeId,
    chapterId,
    order,
    thumbnailVersion: 1,
  };
  page.elements = getTemplatePanels("three", page);
  page.layerOrder = page.elements.map((element) => element.id);
  return page;
}

export function cloneHierarchyPage(source: MangaPage, volumeId: string, chapterId: string, name: string): MangaPage {
  const clone = structuredClone(source);
  clone.id = uid("page");
  clone.name = name;
  clone.volumeId = volumeId;
  clone.chapterId = chapterId;
  clone.thumbnailVersion += 1;

  const elementIds = new Map(clone.elements.map((element) => [element.id, uid(element.kind)]));
  const groupIds = new Map(
    [...new Set(clone.elements.map((element) => element.groupId).filter((groupId): groupId is string => Boolean(groupId)))]
      .map((groupId) => [groupId, uid("group")]),
  );
  clone.elements = clone.elements.map((element) => ({
    ...element,
    id: elementIds.get(element.id) ?? uid(element.kind),
    parentId: element.parentId ? elementIds.get(element.parentId) : undefined,
    groupId: element.groupId ? groupIds.get(element.groupId) : undefined,
  })) as MangaElement[];

  const rasterIds = new Map<string, string>();
  clone.rasterLayers = clone.rasterLayers.map((layer) => {
    const id = uid("raster");
    rasterIds.set(layer.id, id);
    return {
      ...layer,
      id,
      bitmapKey: undefined,
      strokes: layer.strokes.map((stroke) => ({ ...stroke, id: uid("stroke") })),
    };
  });
  clone.layerOrder = clone.layerOrder.map((id) => elementIds.get(id) ?? rasterIds.get(id) ?? id);
  normalizePageLayerOrder(clone);
  return clone;
}

export function normalizeProjectHierarchy(project: MangaProject): void {
  const chaptersById = new Map(project.chapters.map((chapter) => [chapter.id, chapter]));
  const pagesById = new Map(project.pages.map((page) => [page.id, page]));

  project.volumes.forEach((volume, volumeOrder) => {
    volume.order = volumeOrder;
    volume.chapterIds = volume.chapterIds.filter((id, index, ids) => {
      const chapter = chaptersById.get(id);
      return ids.indexOf(id) === index && chapter?.volumeId === volume.id;
    });
  });

  const orderedChapters: MangaChapter[] = [];
  for (const volume of project.volumes) {
    volume.chapterIds.forEach((id, order) => {
      const chapter = chaptersById.get(id);
      if (!chapter) return;
      chapter.order = order;
      chapter.pageIds = chapter.pageIds.filter((pageId, index, ids) => {
        const page = pagesById.get(pageId);
        return ids.indexOf(pageId) === index && page?.chapterId === chapter.id && page.volumeId === volume.id;
      });
      orderedChapters.push(chapter);
    });
  }
  project.chapters = orderedChapters;

  const orderedPages: MangaPage[] = [];
  for (const chapter of project.chapters) {
    chapter.pageIds.forEach((id, order) => {
      const page = pagesById.get(id);
      if (!page) return;
      page.order = order;
      orderedPages.push(page);
    });
  }
  project.pages = orderedPages;
}

function selectPage(page: MangaPage): void {
  runtime.project.activeVolumeId = page.volumeId;
  runtime.project.activeChapterId = page.chapterId;
  runtime.project.activePageId = page.id;
  setSelection([]);
}

export function activateProjectPage(pageId: string): boolean {
  const page = runtime.project.pages.find((candidate) => candidate.id === pageId);
  if (!page) return false;
  selectPage(page);
  return true;
}

export function activateProjectChapter(chapterId: string): boolean {
  const chapter = runtime.project.chapters.find((candidate) => candidate.id === chapterId);
  if (!chapter) return false;
  const page = runtime.project.pages.find((candidate) => candidate.id === chapter.pageIds[0]);
  runtime.project.activeVolumeId = chapter.volumeId;
  runtime.project.activeChapterId = chapter.id;
  if (page) runtime.project.activePageId = page.id;
  setSelection([]);
  return true;
}

export function activateProjectVolume(volumeId: string): boolean {
  const volume = runtime.project.volumes.find((candidate) => candidate.id === volumeId);
  if (!volume) return false;
  const chapter = runtime.project.chapters.find((candidate) => candidate.id === volume.chapterIds[0]);
  runtime.project.activeVolumeId = volume.id;
  if (chapter) return activateProjectChapter(chapter.id);
  setSelection([]);
  return true;
}

export function addProjectPage(): void {
  transact(() => {
    const volume = runtime.project.volumes.find((item) => item.id === runtime.project.activeVolumeId) ?? runtime.project.volumes[0]!;
    const chapter = runtime.project.chapters.find((item) => item.id === runtime.project.activeChapterId && item.volumeId === volume.id)
      ?? runtime.project.chapters.find((item) => item.volumeId === volume.id)
      ?? runtime.project.chapters[0]!;
    const page = createHierarchyPage(volume.id, chapter.id, chapter.pageIds.length);
    chapter.pageIds.push(page.id);
    runtime.project.pages.push(page);
    normalizeProjectHierarchy(runtime.project);
    selectPage(page);
  });
}

export function duplicateProjectPage(): boolean {
  const source = runtime.project.pages.find((page) => page.id === runtime.project.activePageId);
  if (!source) return false;
  const chapter = runtime.project.chapters.find((item) => item.id === source.chapterId);
  if (!chapter) return false;
  transact(() => {
    const page = cloneHierarchyPage(source, source.volumeId, source.chapterId, `${source.name} สำเนา`);
    chapter.pageIds.splice(chapter.pageIds.indexOf(source.id) + 1, 0, page.id);
    runtime.project.pages.push(page);
    normalizeProjectHierarchy(runtime.project);
    selectPage(page);
  });
  return true;
}

export function addProjectVolume(): void {
  transact(() => {
    const volumeId = uid("volume");
    const chapterId = uid("chapter");
    const page = createHierarchyPage(volumeId, chapterId, 0);
    const volume: MangaVolume = {
      id: volumeId,
      name: `เล่ม ${runtime.project.volumes.length + 1}`,
      chapterIds: [chapterId],
      order: runtime.project.volumes.length,
    };
    const chapter: MangaChapter = { id: chapterId, volumeId, name: "บทที่ 1", pageIds: [page.id], order: 0 };
    runtime.project.volumes.push(volume);
    runtime.project.chapters.push(chapter);
    runtime.project.pages.push(page);
    normalizeProjectHierarchy(runtime.project);
    selectPage(page);
  });
}

export function addProjectChapter(): void {
  transact(() => {
    const volume = runtime.project.volumes.find((item) => item.id === runtime.project.activeVolumeId) ?? runtime.project.volumes[0]!;
    const chapterId = uid("chapter");
    const page = createHierarchyPage(volume.id, chapterId, 0);
    const chapter: MangaChapter = {
      id: chapterId,
      volumeId: volume.id,
      name: `บทที่ ${volume.chapterIds.length + 1}`,
      pageIds: [page.id],
      order: volume.chapterIds.length,
    };
    volume.chapterIds.push(chapter.id);
    runtime.project.chapters.push(chapter);
    runtime.project.pages.push(page);
    normalizeProjectHierarchy(runtime.project);
    selectPage(page);
  });
}

export function duplicateProjectChapter(): boolean {
  const source = runtime.project.chapters.find((chapter) => chapter.id === runtime.project.activeChapterId);
  const volume = runtime.project.volumes.find((candidate) => candidate.id === source?.volumeId);
  if (!source || !volume) return false;
  transact(() => {
    const chapter: MangaChapter = {
      id: uid("chapter"),
      volumeId: volume.id,
      name: `${source.name} สำเนา`,
      pageIds: [],
      order: source.order + 1,
    };
    for (const pageId of source.pageIds) {
      const sourcePage = runtime.project.pages.find((page) => page.id === pageId);
      if (!sourcePage) continue;
      const page = cloneHierarchyPage(sourcePage, volume.id, chapter.id, `${sourcePage.name} สำเนา`);
      chapter.pageIds.push(page.id);
      runtime.project.pages.push(page);
    }
    if (!chapter.pageIds.length) {
      const page = createHierarchyPage(volume.id, chapter.id, 0);
      chapter.pageIds.push(page.id);
      runtime.project.pages.push(page);
    }
    runtime.project.chapters.push(chapter);
    volume.chapterIds.splice(volume.chapterIds.indexOf(source.id) + 1, 0, chapter.id);
    normalizeProjectHierarchy(runtime.project);
    selectPage(runtime.project.pages.find((page) => page.id === chapter.pageIds[0])!);
  });
  return true;
}

export function duplicateProjectVolume(): boolean {
  const source = runtime.project.volumes.find((volume) => volume.id === runtime.project.activeVolumeId);
  if (!source) return false;
  transact(() => {
    const volume: MangaVolume = {
      id: uid("volume"),
      name: `${source.name} สำเนา`,
      chapterIds: [],
      order: source.order + 1,
    };
    for (const chapterId of source.chapterIds) {
      const sourceChapter = runtime.project.chapters.find((chapter) => chapter.id === chapterId);
      if (!sourceChapter) continue;
      const chapter: MangaChapter = {
        id: uid("chapter"),
        volumeId: volume.id,
        name: `${sourceChapter.name} สำเนา`,
        pageIds: [],
        order: sourceChapter.order,
      };
      for (const pageId of sourceChapter.pageIds) {
        const sourcePage = runtime.project.pages.find((page) => page.id === pageId);
        if (!sourcePage) continue;
        const page = cloneHierarchyPage(sourcePage, volume.id, chapter.id, `${sourcePage.name} สำเนา`);
        chapter.pageIds.push(page.id);
        runtime.project.pages.push(page);
      }
      if (!chapter.pageIds.length) {
        const page = createHierarchyPage(volume.id, chapter.id, 0);
        chapter.pageIds.push(page.id);
        runtime.project.pages.push(page);
      }
      volume.chapterIds.push(chapter.id);
      runtime.project.chapters.push(chapter);
    }
    runtime.project.volumes.splice(runtime.project.volumes.indexOf(source) + 1, 0, volume);
    normalizeProjectHierarchy(runtime.project);
    const firstPageId = runtime.project.chapters.find((chapter) => chapter.id === volume.chapterIds[0])?.pageIds[0];
    const firstPage = runtime.project.pages.find((page) => page.id === firstPageId);
    if (firstPage) selectPage(firstPage);
  });
  return true;
}

function moveIdBefore(ids: string[], movingId: string, targetId: string): boolean {
  if (movingId === targetId || !ids.includes(movingId) || !ids.includes(targetId)) return false;
  ids.splice(ids.indexOf(movingId), 1);
  ids.splice(ids.indexOf(targetId), 0, movingId);
  return true;
}

export function reorderProjectVolumes(movingId: string, targetId: string): boolean {
  const ids = runtime.project.volumes.map((volume) => volume.id);
  if (!moveIdBefore(ids, movingId, targetId)) return false;
  transact(() => {
    const byId = new Map(runtime.project.volumes.map((volume) => [volume.id, volume]));
    runtime.project.volumes = ids.map((id) => byId.get(id)).filter((volume): volume is MangaVolume => volume !== undefined);
    normalizeProjectHierarchy(runtime.project);
  });
  return true;
}

export function reorderProjectChapters(movingId: string, targetId: string): boolean {
  const moving = runtime.project.chapters.find((chapter) => chapter.id === movingId);
  const target = runtime.project.chapters.find((chapter) => chapter.id === targetId);
  if (!moving || !target || moving.volumeId !== target.volumeId) return false;
  const volume = runtime.project.volumes.find((candidate) => candidate.id === moving.volumeId);
  if (!volume) return false;
  const ids = [...volume.chapterIds];
  if (!moveIdBefore(ids, movingId, targetId)) return false;
  transact(() => {
    volume.chapterIds = ids;
    normalizeProjectHierarchy(runtime.project);
  });
  return true;
}

export function reorderProjectPages(movingId: string, targetId: string): boolean {
  const moving = runtime.project.pages.find((page) => page.id === movingId);
  const target = runtime.project.pages.find((page) => page.id === targetId);
  if (!moving || !target) return false;
  const sourceChapter = runtime.project.chapters.find((chapter) => chapter.id === moving.chapterId);
  const targetChapter = runtime.project.chapters.find((chapter) => chapter.id === target.chapterId);
  if (!sourceChapter || !targetChapter) return false;
  transact(() => {
    sourceChapter.pageIds = sourceChapter.pageIds.filter((id) => id !== moving.id);
    const targetIds = sourceChapter.id === targetChapter.id ? sourceChapter.pageIds : [...targetChapter.pageIds];
    targetIds.splice(Math.max(0, targetIds.indexOf(target.id)), 0, moving.id);
    targetChapter.pageIds = targetIds;
    moving.chapterId = targetChapter.id;
    moving.volumeId = targetChapter.volumeId;
    normalizeProjectHierarchy(runtime.project);
  });
  return true;
}

export function moveProjectPage(direction: -1 | 1): boolean {
  const page = runtime.project.pages.find((candidate) => candidate.id === runtime.project.activePageId);
  const chapter = runtime.project.chapters.find((candidate) => candidate.id === page?.chapterId);
  const index = chapter?.pageIds.indexOf(page?.id ?? "") ?? -1;
  const nextIndex = index + direction;
  if (!page || !chapter || index < 0 || nextIndex < 0 || nextIndex >= chapter.pageIds.length) return false;
  transact(() => {
    [chapter.pageIds[index], chapter.pageIds[nextIndex]] = [chapter.pageIds[nextIndex]!, chapter.pageIds[index]!];
    normalizeProjectHierarchy(runtime.project);
  });
  return true;
}
