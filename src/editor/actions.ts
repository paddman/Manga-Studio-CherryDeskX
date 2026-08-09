import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  createBubble,
  createImage,
  createPanel,
  createText,
  uid,
} from "../sample";
import { safeAssetMimeType, sanitizeSvg, validateImageFile } from "../security/files";
import type {
  BubbleVariant,
  ImageElement,
  MangaAsset,
  MangaElement,
  MangaPage,
  ReadingDirection,
} from "../types";
import { activePage, runtime, selectedElement, selectedElements, setSelection, transact } from "./state";
import { getTemplatePanels } from "./templates";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyPanelTemplate(template: string): void {
  transact(() => {
    const page = activePage();
    const content = page.elements.filter((element) => element.kind !== "panel").map((element) => {
      if (element.kind !== "image" || !element.parentId) return element;
      const parent = page.elements.find((candidate) => candidate.id === element.parentId);
      return parent ? { ...element, x: element.x + parent.x, y: element.y + parent.y, parentId: undefined } : { ...element, parentId: undefined };
    });
    page.elements = [...getTemplatePanels(template, page), ...content];
    runtime.selectedId = null;
  });
}

export function addPanel(): void {
  transact(() => {
    const panel = createPanel("ช่องใหม่", 110, 130, 360, 320);
    activePage().elements.unshift(panel);
    runtime.selectedId = panel.id;
  });
}

export function addTextElement(title = false): void {
  transact(() => {
    const element = createText(
      title ? "CHAPTER 01\nเสียงเรียกจากความมืด" : "พิมพ์ข้อความตรงนี้",
      180,
      150,
      title ? 430 : 320,
      title ? 130 : 90,
    );
    if (title) {
      element.fontSize = 38;
      element.fontWeight = 900;
      element.color = "#ffffff";
    }
    activePage().elements.push(element);
    runtime.selectedId = element.id;
  });
}

export function addBubble(variant: BubbleVariant): void {
  transact(() => {
    const element = createBubble("พิมพ์บทพูดตรงนี้", 240, 180);
    element.variant = variant;
    if (variant === "caption") {
      element.background = "#17131f";
      element.color = "#ffffff";
      element.borderWidth = 0;
      element.height = 105;
    }
    if (variant === "shout") {
      element.fontWeight = 900;
      element.fontSize = 30;
    }
    activePage().elements.push(element);
    runtime.selectedId = element.id;
  });
}

function imageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("อ่านขนาดรูปไม่สำเร็จ"));
    image.src = src;
  });
}

interface LoadedAsset {
  asset: MangaAsset;
  image: ImageElement;
  blob: Blob;
}

async function readAsset(file: File): Promise<LoadedAsset> {
  await validateImageFile(file);
  const blob = file.name.toLowerCase().endsWith(".svg")
    ? new Blob([sanitizeSvg(await file.text())], { type: "image/svg+xml" })
    : file.slice(0, file.size, safeAssetMimeType(file));
  const src = URL.createObjectURL(blob);
  const dimensions = await imageDimensions(src);
  const ratio = Math.min(430 / dimensions.width, 430 / dimensions.height, 1);
  const width = Math.max(120, dimensions.width * ratio);
  const height = Math.max(120, dimensions.height * ratio);
  const asset: MangaAsset = {
    id: uid("asset"),
    name: file.name,
    src,
    mimeType: blob.type,
    byteSize: blob.size,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: new Date().toISOString(),
  };
  const image = { ...createImage(file.name, src, 120, 140, width, height), assetId: asset.id };
  return { asset, image, blob };
}

export async function handleUploads(files: FileList | null, replaceSelected = false): Promise<number> {
  if (!files?.length) return 0;
  const loaded = await Promise.all([...files].map(readAsset));
  await Promise.all(
    loaded.map(async ({ asset, blob }) => {
      await runtime.persistence.assets.put(asset.id, blob);
      runtime.assetSources.set(asset.id, asset.src);
    }),
  );
  transact(() => {
    for (const item of loaded) {
      runtime.project.assets.push(item.asset);
      const selected = selectedElement();
      if (replaceSelected && selected?.kind === "image") {
        selected.src = item.asset.src;
        selected.assetId = item.asset.id;
        setCropRect(selected, { left: 0, top: 0, width: 1, height: 1 });
        selected.name = item.asset.name;
        replaceSelected = false;
      } else {
        activePage().elements.push(item.image);
        runtime.selectedId = item.image.id;
      }
    }
  });
  return loaded.length;
}

export async function addAssetToPage(assetId: string): Promise<boolean> {
  const asset = runtime.project.assets.find((item) => item.id === assetId);
  if (!asset) return false;
  const dimensions = await imageDimensions(asset.src);
  const scale = Math.min(430 / dimensions.width, 430 / dimensions.height, 1);
  transact(() => {
    const element = createImage(
      asset.name,
      asset.src,
      130,
      140,
      Math.max(120, dimensions.width * scale),
      Math.max(120, dimensions.height * scale),
    );
    element.assetId = asset.id;
    activePage().elements.push(element);
    runtime.selectedId = element.id;
  });
  return true;
}

export function duplicateSelected(): void {
  const elements = selectedElements();
  if (!elements.length) return;
  transact(() => {
    const clones = elements.map((element) => {
      const clone = structuredClone(element) as MangaElement;
      clone.id = uid(element.kind);
      clone.name = `${element.name} สำเนา`;
      clone.x += 24;
      clone.y += 24;
      return clone;
    });
    activePage().elements.push(...clones);
    setSelection(clones.map((clone) => clone.id));
  });
}

export function deleteSelected(): void {
  const ids = new Set(selectedElements().map((element) => element.id));
  if (!ids.size) return;
  transact(() => {
    const page = activePage();
    page.elements = page.elements.filter((element) => !ids.has(element.id) && !(element.parentId && ids.has(element.parentId)));
    setSelection([]);
  });
}

export function moveLayer(direction: 1 | -1): void {
  if (!runtime.selectedId) return;
  transact(() => {
    const elements = activePage().elements;
    const index = elements.findIndex((element) => element.id === runtime.selectedId);
    const nextIndex = clamp(index + direction, 0, elements.length - 1);
    if (index < 0 || index === nextIndex) return;
    const [item] = elements.splice(index, 1);
    if (item) elements.splice(nextIndex, 0, item);
  });
}

export function toggleSelectedLock(): void {
  const elements = selectedElements();
  if (!elements.length) return;
  transact(() => {
    const locked = elements.every((element) => element.locked);
    elements.forEach((element) => { element.locked = !locked; });
  });
}

export function addPage(): void {
  transact(() => {
    const volume = runtime.project.volumes.find((item) => item.id === runtime.project.activeVolumeId) ?? runtime.project.volumes[0]!;
    const chapter = runtime.project.chapters.find((item) => item.id === runtime.project.activeChapterId) ?? runtime.project.chapters[0]!;
    const page: MangaPage = {
      id: uid("page"),
      name: `หน้า ${runtime.project.pages.length + 1}`,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      background: "#f7f5fb",
      elements: [],
      rasterLayers: [],
      layerOrder: [],
      volumeId: volume.id,
      chapterId: chapter.id,
      order: chapter.pageIds.length,
      thumbnailVersion: 1,
    };
    page.elements = getTemplatePanels("three", page);
    runtime.project.pages.push(page);
    chapter.pageIds.push(page.id);
    runtime.project.activePageId = page.id;
    runtime.selectedId = null;
  });
}

export function duplicatePage(): void {
  const page = activePage();
  transact(() => {
    const clone = structuredClone(page);
    clone.id = uid("page");
    clone.name = `${page.name} สำเนา`;
    const ids = new Map<string, string>();
    clone.elements = clone.elements.map((element) => {
      const nextId = uid(element.kind);
      ids.set(element.id, nextId);
      return { ...element, id: nextId, parentId: element.parentId ? ids.get(element.parentId) : undefined };
    }) as MangaElement[];
    const rasterIds = new Map<string, string>();
    clone.rasterLayers = clone.rasterLayers.map((layer) => {
      const nextId = uid("raster");
      rasterIds.set(layer.id, nextId);
      return { ...layer, id: nextId, bitmapKey: undefined, strokes: layer.strokes.map((stroke) => ({ ...stroke, id: uid("stroke") })) };
    });
    clone.layerOrder = clone.layerOrder.map((id) => ids.get(id) ?? rasterIds.get(id) ?? id);
    const index = runtime.project.pages.findIndex((item) => item.id === page.id);
    runtime.project.pages.splice(index + 1, 0, clone);
    const chapter = runtime.project.chapters.find((item) => item.id === clone.chapterId);
    chapter?.pageIds.splice(chapter.pageIds.indexOf(page.id) + 1, 0, clone.id);
    runtime.project.activePageId = clone.id;
    runtime.selectedId = null;
  });
}

export function deletePage(): void {
  if (runtime.project.pages.length <= 1) return;
  transact(() => {
    const index = runtime.project.pages.findIndex((page) => page.id === runtime.project.activePageId);
    runtime.project.pages.splice(index, 1);
    for (const chapter of runtime.project.chapters) chapter.pageIds = chapter.pageIds.filter((id) => id !== runtime.project.activePageId);
    runtime.project.activePageId = runtime.project.pages[Math.max(0, index - 1)]!.id;
    runtime.selectedId = null;
  });
}

export function smartLayout(): void {
  transact(() => {
    const page = activePage();
    const imageCount = page.elements.filter((element) => element.kind === "image").length;
    const content = page.elements.filter((element) => element.kind !== "panel").map((element) => {
      if (element.kind !== "image" || !element.parentId) return element;
      const parent = page.elements.find((candidate) => candidate.id === element.parentId);
      return parent ? { ...element, x: element.x + parent.x, y: element.y + parent.y, parentId: undefined } : { ...element, parentId: undefined };
    });
    const template = imageCount <= 1 ? "single" : imageCount === 2 ? "two-horizontal" : imageCount <= 3 ? "three" : "four";
    const panels = getTemplatePanels(template, page);
    page.elements = [...panels, ...content];
    page.elements.filter((element): element is ImageElement => element.kind === "image").slice(0, panels.length).forEach((image, index) => {
      const panel = panels[index];
      if (!panel) return;
      image.x = panel.x + panel.borderWidth;
      image.y = panel.y + panel.borderWidth;
      image.width = panel.width - panel.borderWidth * 2;
      image.height = panel.height - panel.borderWidth * 2;
      image.parentId = panel.id;
      image.x = panel.borderWidth;
      image.y = panel.borderWidth;
      image.rotation = 0;
      image.fit = "cover";
    });
    runtime.selectedId = null;
  });
}

export function setSelectedProperty(prop: string, rawValue: string | boolean): void {
  const element = selectedElement();
  if (!element) return;
  transact(() => {
    const record = element as unknown as Record<string, unknown>;
    if (prop === "opacity-percent") {
      element.opacity = clamp(Number(rawValue) / 100, 0, 1);
      return;
    }
    const numericProps = new Set([
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "borderWidth",
      "borderRadius",
      "grayscale",
      "contrast",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "tailX",
      "tailY",
    ]);
    record[prop] = numericProps.has(prop) ? Number(rawValue) : rawValue;
    element.width = Math.max(10, element.width);
    element.height = Math.max(10, element.height);
  });
}

export function setPageProperty(prop: string, rawValue: string): void {
  transact(() => {
    const page = activePage();
    if (prop === "page-name") page.name = rawValue;
    if (prop === "page-width") page.width = clamp(Number(rawValue), 320, 3000);
    if (prop === "page-height") page.height = clamp(Number(rawValue), 320, 5000);
    if (prop === "page-background") page.background = rawValue;
  });
}

export function setProjectProperty(prop: string, rawValue: string): void {
  transact(() => {
    if (prop === "readingDirection") runtime.project.readingDirection = rawValue as ReadingDirection;
  });
}

export function addQuickPanel(): void {
  transact(() => {
    const panel = createPanel("ช่องใหม่", 140, 160, 360, 300);
    activePage().elements.unshift(panel);
    runtime.selectedId = panel.id;
  });
}

export function assignSelectedImageToPanel(panelId: string | null): boolean {
  const element = selectedElement();
  if (!element || element.kind !== "image") return false;
  const panel = activePage().elements.find((item) => item.id === panelId && item.kind === "panel");
  if (!panel || panel.kind !== "panel") return false;
  transact(() => {
    element.parentId = panel.id;
    element.x = Math.max(0, Math.min(panel.width - element.width, element.x - panel.x));
    element.y = Math.max(0, Math.min(panel.height - element.height, element.y - panel.y));
    panel.clipChildren = true;
  });
  return true;
}

export function detachSelectedImage(): boolean {
  const element = selectedElement();
  if (!element || element.kind !== "image" || !element.parentId) return false;
  const panel = activePage().elements.find((item) => item.id === element.parentId && item.kind === "panel");
  transact(() => {
    if (panel) {
      element.x += panel.x;
      element.y += panel.y;
    }
    element.parentId = undefined;
  });
  return true;
}

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getCropRect(element: ImageElement): CropRect {
  const width = clamp(element.crop.width ?? 1 / Math.max(1, element.crop.scale), 0.05, 1);
  const height = clamp(element.crop.height ?? 1 / Math.max(1, element.crop.scale), 0.05, 1);
  return {
    left: clamp(element.crop.left ?? element.crop.x - width / 2, 0, 1 - width),
    top: clamp(element.crop.top ?? element.crop.y - height / 2, 0, 1 - height),
    width,
    height,
  };
}

export function setCropRect(element: ImageElement, next: CropRect): void {
  const width = clamp(next.width, 0.05, 1);
  const height = clamp(next.height, 0.05, 1);
  const left = clamp(next.left, 0, 1 - width);
  const top = clamp(next.top, 0, 1 - height);
  element.crop = {
    x: left + width / 2,
    y: top + height / 2,
    scale: clamp(1 / Math.min(width, height), 1, 5),
    left,
    top,
    width,
    height,
  };
}

export function setCropValue(axis: "x" | "y" | "scale", value: number): void {
  const element = selectedElement();
  if (!element || element.kind !== "image") return;
  transact(() => {
    const current = getCropRect(element);
    if (axis === "scale") {
      const size = clamp(1 / clamp(value, 1, 5), 0.05, 1);
      setCropRect(element, { left: element.crop.x - size / 2, top: element.crop.y - size / 2, width: size, height: size });
    } else if (axis === "x") {
      setCropRect(element, { ...current, left: clamp(value - current.width / 2, 0, 1 - current.width) });
    } else {
      setCropRect(element, { ...current, top: clamp(value - current.height / 2, 0, 1 - current.height) });
    }
  });
}

export function resetImageEdits(): void {
  const element = selectedElement();
  if (!element || element.kind !== "image") return;
  transact(() => {
    element.fit = "cover";
    element.grayscale = 0;
    element.contrast = 100;
    element.borderRadius = 0;
    setCropRect(element, { left: 0, top: 0, width: 1, height: 1 });
    element.flipX = false;
    element.flipY = false;
  });
}

export function addVolume(): void {
  transact(() => {
    const id = uid("volume");
    const chapterId = uid("chapter");
    runtime.project.volumes.push({ id, name: `เล่ม ${runtime.project.volumes.length + 1}`, chapterIds: [chapterId], order: runtime.project.volumes.length });
    runtime.project.chapters.push({ id: chapterId, volumeId: id, name: "บทที่ 1", pageIds: [], order: 0 });
    runtime.project.activeVolumeId = id;
    runtime.project.activeChapterId = chapterId;
  });
}

export function addChapter(): void {
  transact(() => {
    const volume = runtime.project.volumes.find((item) => item.id === runtime.project.activeVolumeId) ?? runtime.project.volumes[0]!;
    const chapterId = uid("chapter");
    runtime.project.chapters.push({ id: chapterId, volumeId: volume.id, name: `บทที่ ${volume.chapterIds.length + 1}`, pageIds: [], order: volume.chapterIds.length });
    volume.chapterIds.push(chapterId);
    runtime.project.activeChapterId = chapterId;
  });
}

export function deleteActiveChapter(): boolean {
  if (runtime.project.chapters.length <= 1) return false;
  const chapterIndex = runtime.project.chapters.findIndex((item) => item.id === runtime.project.activeChapterId);
  const chapter = runtime.project.chapters[chapterIndex];
  if (!chapter) return false;
  if (runtime.project.pages.every((page) => chapter.pageIds.includes(page.id))) return false;
  transact(() => {
    const pageIds = new Set(chapter.pageIds);
    runtime.project.pages = runtime.project.pages.filter((page) => !pageIds.has(page.id));
    runtime.project.chapters.splice(chapterIndex, 1);
    for (const volume of runtime.project.volumes) volume.chapterIds = volume.chapterIds.filter((id) => id !== chapter.id);
    const next = runtime.project.chapters[Math.max(0, chapterIndex - 1)]!;
    runtime.project.activeChapterId = next.id;
    runtime.project.activeVolumeId = next.volumeId;
    runtime.project.activePageId = next.pageIds[0] ?? runtime.project.pages[0]!.id;
  });
  return true;
}

export function deleteActiveVolume(): boolean {
  if (runtime.project.volumes.length <= 1) return false;
  const volumeIndex = runtime.project.volumes.findIndex((item) => item.id === runtime.project.activeVolumeId);
  const volume = runtime.project.volumes[volumeIndex];
  if (!volume) return false;
  const volumeChapterIds = new Set(volume.chapterIds);
  if (runtime.project.pages.every((page) => volumeChapterIds.has(page.chapterId))) return false;
  transact(() => {
    const chapterIds = new Set(volume.chapterIds);
    const pageIds = new Set(runtime.project.chapters.filter((chapter) => chapterIds.has(chapter.id)).flatMap((chapter) => chapter.pageIds));
    runtime.project.pages = runtime.project.pages.filter((page) => !pageIds.has(page.id));
    runtime.project.chapters = runtime.project.chapters.filter((chapter) => !chapterIds.has(chapter.id));
    runtime.project.volumes.splice(volumeIndex, 1);
    const next = runtime.project.volumes[Math.max(0, volumeIndex - 1)]!;
    runtime.project.activeVolumeId = next.id;
    const nextChapter = runtime.project.chapters.find((chapter) => chapter.volumeId === next.id) ?? runtime.project.chapters[0]!;
    runtime.project.activeChapterId = nextChapter.id;
    runtime.project.activePageId = nextChapter.pageIds[0] ?? runtime.project.pages[0]!.id;
  });
  return true;
}

export function moveActivePage(direction: -1 | 1): boolean {
  const pageIndex = runtime.project.pages.findIndex((page) => page.id === runtime.project.activePageId);
  const page = runtime.project.pages[pageIndex];
  const nextIndex = pageIndex + direction;
  if (!page || nextIndex < 0 || nextIndex >= runtime.project.pages.length) return false;
  const nextPage = runtime.project.pages[nextIndex]!;
  if (nextPage.chapterId !== page.chapterId) return false;
  transact(() => {
    [runtime.project.pages[pageIndex], runtime.project.pages[nextIndex]] = [runtime.project.pages[nextIndex]!, runtime.project.pages[pageIndex]!];
    const chapter = runtime.project.chapters.find((item) => item.id === page.chapterId);
    if (chapter) {
      const order = chapter.pageIds.indexOf(page.id);
      const otherOrder = chapter.pageIds.indexOf(nextPage.id);
      if (order >= 0 && otherOrder >= 0) [chapter.pageIds[order], chapter.pageIds[otherOrder]] = [chapter.pageIds[otherOrder]!, chapter.pageIds[order]!];
    }
    runtime.project.pages.forEach((item, index) => { item.order = index; item.thumbnailVersion += 1; });
  });
  return true;
}

export function setHierarchyName(kind: "volume" | "chapter", value: string): void {
  transact(() => {
    if (kind === "volume") {
      const volume = runtime.project.volumes.find((item) => item.id === runtime.project.activeVolumeId);
      if (volume) volume.name = value.trim() || volume.name;
    } else {
      const chapter = runtime.project.chapters.find((item) => item.id === runtime.project.activeChapterId);
      if (chapter) chapter.name = value.trim() || chapter.name;
    }
  });
}

export function removeOrphanAssets(): number {
  const used = new Set<string>();
  for (const page of runtime.project.pages) {
    for (const element of page.elements) if (element.kind === "image" && element.assetId) used.add(element.assetId);
  }
  const orphaned = runtime.project.assets.filter((asset) => !used.has(asset.id));
  if (!orphaned.length) return 0;
  transact(() => {
    runtime.project.assets = runtime.project.assets.filter((asset) => used.has(asset.id));
    for (const asset of orphaned) {
      const source = runtime.assetSources.get(asset.id);
      if (source?.startsWith("blob:")) URL.revokeObjectURL(source);
      runtime.assetSources.delete(asset.id);
      void runtime.persistence.assets.remove(asset.id);
    }
  });
  return orphaned.length;
}

function elementPagePosition(element: MangaElement): { x: number; y: number } {
  if (!element.parentId) return { x: element.x, y: element.y };
  const parent = activePage().elements.find((candidate) => candidate.id === element.parentId);
  return parent ? { x: parent.x + element.x, y: parent.y + element.y } : { x: element.x, y: element.y };
}

function setElementPagePosition(element: MangaElement, x: number, y: number): void {
  if (!element.parentId) {
    element.x = x;
    element.y = y;
    return;
  }
  const parent = activePage().elements.find((candidate) => candidate.id === element.parentId);
  element.x = parent ? x - parent.x : x;
  element.y = parent ? y - parent.y : y;
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

export function alignSelected(alignment: Alignment): void {
  const elements = selectedElements();
  if (elements.length < 2) return;
  transact(() => {
    const boxes = elements.map((element) => ({ element, ...elementPagePosition(element) }));
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.element.width));
    const top = Math.min(...boxes.map((box) => box.y));
    const bottom = Math.max(...boxes.map((box) => box.y + box.element.height));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    for (const box of boxes) {
      const x = alignment === "left" ? left : alignment === "right" ? right - box.element.width : alignment === "center" ? centerX - box.element.width / 2 : box.x;
      const y = alignment === "top" ? top : alignment === "bottom" ? bottom - box.element.height : alignment === "middle" ? centerY - box.element.height / 2 : box.y;
      setElementPagePosition(box.element, x, y);
    }
  });
}

export function distributeSelected(axis: "horizontal" | "vertical"): void {
  const elements = selectedElements();
  if (elements.length < 3) return;
  transact(() => {
    const boxes = elements.map((element) => ({ element, ...elementPagePosition(element) })).sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);
    const first = boxes[0]!;
    const last = boxes.at(-1)!;
    const start = axis === "horizontal" ? first.x + first.element.width : first.y + first.element.height;
    const end = axis === "horizontal" ? last.x : last.y;
    const middleSize = boxes.slice(1, -1).reduce((sum, box) => sum + (axis === "horizontal" ? box.element.width : box.element.height), 0);
    const gap = (end - start - middleSize) / (boxes.length - 1);
    let cursor = axis === "horizontal" ? first.x + first.element.width : first.y + first.element.height;
    for (const box of boxes.slice(1, -1)) {
      const x = axis === "horizontal" ? cursor + gap : box.x;
      const y = axis === "vertical" ? cursor + gap : box.y;
      setElementPagePosition(box.element, x, y);
      cursor += (axis === "horizontal" ? box.element.width : box.element.height) + gap;
    }
  });
}

export function flipSelected(axis: "horizontal" | "vertical"): void {
  const elements = selectedElements();
  if (!elements.length) return;
  transact(() => {
    for (const element of elements) {
      if (axis === "horizontal") element.flipX = !element.flipX;
      else element.flipY = !element.flipY;
    }
  });
}

export function groupSelected(): void {
  const elements = selectedElements();
  if (elements.length < 2) return;
  transact(() => {
    const groupId = uid("group");
    elements.forEach((element) => { element.groupId = groupId; });
  });
}

export function ungroupSelected(): void {
  const elements = selectedElements();
  if (!elements.length) return;
  transact(() => {
    elements.forEach((element) => { element.groupId = undefined; });
  });
}

export function copySelected(): void {
  runtime.clipboard = structuredClone(selectedElements()) as MangaElement[];
}

export function cutSelected(): void {
  copySelected();
  deleteSelected();
}

export function pasteElements(): void {
  if (!runtime.clipboard.length) return;
  transact(() => {
    const pasted = runtime.clipboard.map((element) => ({ ...structuredClone(element), id: uid(element.kind), x: element.x + 28, y: element.y + 28 })) as MangaElement[];
    activePage().elements.push(...pasted);
    setSelection(pasted.map((element) => element.id));
  });
}
