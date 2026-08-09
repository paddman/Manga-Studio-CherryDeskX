import { createStarterProject } from "../sample";
import type {
  BubbleElement,
  ImageElement,
  MangaAsset,
  MangaElement,
  MangaPage,
  MangaProject,
  PanelElement,
  TextElement,
} from "../types";
import { PROJECT_SCHEMA_VERSION } from "../types";

type JsonRecord = Record<string, unknown>;

export type PersistedAsset = Omit<MangaAsset, "src">;
export type PersistedImageElement = Omit<ImageElement, "src">;
export type PersistedElement = PanelElement | PersistedImageElement | TextElement | BubbleElement;
export type PersistedPage = Omit<MangaPage, "elements"> & { elements: PersistedElement[] };
export type PersistedProject = Omit<MangaProject, "assets" | "pages"> & {
  assets: PersistedAsset[];
  pages: PersistedPage[];
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function imageSource(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeAsset(value: unknown, index: number): MangaAsset {
  const source = isRecord(value) ? value : {};
  return {
    id: stringValue(source.id, `asset_migrated_${index}`),
    name: stringValue(source.name, `รูปภาพ ${index + 1}`),
    src: imageSource(source.src),
    mimeType: stringValue(source.mimeType, "image/*"),
    byteSize: numberValue(source.byteSize ?? source.size, 0),
    width: numberValue(source.width, 0),
    height: numberValue(source.height, 0),
    createdAt: stringValue(source.createdAt, new Date(0).toISOString()),
  };
}

function baseElement(source: JsonRecord, kind: MangaElement["kind"], index: number): Pick<MangaElement, "id" | "kind" | "name" | "x" | "y" | "width" | "height" | "rotation" | "opacity" | "locked" | "hidden" | "lockAspect" | "flipX" | "flipY"> {
  return {
    id: stringValue(source.id, `${kind}_migrated_${index}`),
    kind,
    name: stringValue(source.name, kind),
    x: numberValue(source.x, 0),
    y: numberValue(source.y, 0),
    width: Math.max(10, numberValue(source.width, 100)),
    height: Math.max(10, numberValue(source.height, 100)),
    rotation: numberValue(source.rotation, 0),
    opacity: Math.min(1, Math.max(0, numberValue(source.opacity, 1))),
    locked: booleanValue(source.locked, false),
    hidden: booleanValue(source.hidden, false),
    lockAspect: booleanValue(source.lockAspect, false),
    flipX: booleanValue(source.flipX, false),
    flipY: booleanValue(source.flipY, false),
  };
}

function normalizeElement(value: unknown, index: number, assets: MangaAsset[]): MangaElement | null {
  const source = isRecord(value) ? value : null;
  if (!source || typeof source.kind !== "string") return null;
  const kind = source.kind;
  if (kind === "panel") {
    return {
      ...baseElement(source, "panel", index),
      kind: "panel",
      background: stringValue(source.background, "#ffffff"),
      borderColor: stringValue(source.borderColor, "#131019"),
      borderWidth: numberValue(source.borderWidth, 8),
      borderRadius: numberValue(source.borderRadius, 2),
      clipChildren: booleanValue(source.clipChildren, true),
    } satisfies PanelElement;
  }
  if (kind === "image") {
    const sourceUrl = imageSource(source.src);
    const matchingAsset = assets.find((asset) => asset.src === sourceUrl);
    const cropSource = isRecord(source.crop) ? source.crop : {};
    return {
      ...baseElement(source, "image", index),
      kind: "image",
      src: sourceUrl,
      assetId: typeof source.assetId === "string" ? source.assetId : matchingAsset?.id,
      fit: source.fit === "contain" || source.fit === "stretch" ? source.fit : "cover",
      borderRadius: numberValue(source.borderRadius, 0),
      grayscale: numberValue(source.grayscale, 0),
      contrast: numberValue(source.contrast, 100),
      crop: {
        x: Math.min(1, Math.max(0, numberValue(cropSource.x, 0.5))),
        y: Math.min(1, Math.max(0, numberValue(cropSource.y, 0.5))),
        scale: Math.max(1, numberValue(cropSource.scale, 1)),
      },
    } satisfies ImageElement;
  }
  if (kind === "text") {
    return {
      ...baseElement(source, "text", index),
      kind: "text",
      text: stringValue(source.text, "พิมพ์ข้อความตรงนี้"),
      color: stringValue(source.color, "#17131f"),
      fontSize: numberValue(source.fontSize, 34),
      fontWeight: numberValue(source.fontWeight, 800),
      fontFamily: stringValue(source.fontFamily, "system-ui, sans-serif"),
      align: source.align === "left" || source.align === "right" ? source.align : "center",
      lineHeight: numberValue(source.lineHeight, 1.25),
      letterSpacing: numberValue(source.letterSpacing, 0),
      writingMode: source.writingMode === "vertical" ? "vertical" : "horizontal",
      outlineColor: stringValue(source.outlineColor, "#000000"),
      outlineWidth: numberValue(source.outlineWidth, 0),
      shadowColor: stringValue(source.shadowColor, "#000000"),
      shadowBlur: numberValue(source.shadowBlur, 0),
    } satisfies TextElement;
  }
  if (kind === "bubble") {
    const tails = Array.isArray(source.tails)
      ? source.tails.filter(isRecord).map((tail, tailIndex) => ({
          id: stringValue(tail.id, `tail_${index}_${tailIndex}`),
          x: numberValue(tail.x, numberValue(source.tailX, 72)),
          y: numberValue(tail.y, numberValue(source.tailY, 114)),
        }))
      : [];
    const tailX = numberValue(source.tailX, 72);
    const tailY = numberValue(source.tailY, 114);
    return {
      ...baseElement(source, "bubble", index),
      kind: "bubble",
      text: stringValue(source.text, "พิมพ์บทพูดตรงนี้"),
      variant: source.variant === "thought" || source.variant === "shout" || source.variant === "caption" ? source.variant : "speech",
      background: stringValue(source.background, "#ffffff"),
      color: stringValue(source.color, "#17131f"),
      borderColor: stringValue(source.borderColor, "#17131f"),
      borderWidth: numberValue(source.borderWidth, 5),
      fontSize: numberValue(source.fontSize, 25),
      fontWeight: numberValue(source.fontWeight, 750),
      align: source.align === "left" || source.align === "right" ? source.align : "center",
      tailX,
      tailY,
      tails: tails.length ? tails : [{ id: `tail_${index}`, x: tailX, y: tailY }],
    } satisfies BubbleElement;
  }
  return null;
}

function normalizePage(value: unknown, index: number, volumeId: string, chapterId: string, assets: MangaAsset[]): MangaPage {
  const source = isRecord(value) ? value : {};
  const elements = Array.isArray(source.elements)
    ? source.elements.map((element, elementIndex) => normalizeElement(element, elementIndex, assets)).filter((element): element is MangaElement => element !== null)
    : [];
  return {
    id: stringValue(source.id, `page_migrated_${index}`),
    name: stringValue(source.name, `หน้า ${index + 1}`),
    width: Math.max(320, numberValue(source.width, 794)),
    height: Math.max(320, numberValue(source.height, 1123)),
    background: stringValue(source.background, "#f7f5fb"),
    elements,
    volumeId: stringValue(source.volumeId, volumeId),
    chapterId: stringValue(source.chapterId, chapterId),
    order: numberValue(source.order, index),
    thumbnailVersion: numberValue(source.thumbnailVersion, 1),
  };
}

export function migrateProject(input: unknown): MangaProject {
  const fallback = createStarterProject();
  if (!isRecord(input)) return fallback;
  const assets = Array.isArray(input.assets) ? input.assets.map(normalizeAsset) : [];
  const volumeId = stringValue(input.activeVolumeId, `volume_migrated_0`);
  const chapterId = stringValue(input.activeChapterId, `chapter_migrated_0`);
  const rawPages = Array.isArray(input.pages) ? input.pages : [];
  const pages = rawPages.length ? rawPages.map((page, index) => normalizePage(page, index, volumeId, chapterId, assets)) : fallback.pages;
  const pageIds = pages.map((page) => page.id);
  const chapters = Array.isArray(input.chapters)
    ? input.chapters.filter(isRecord).map((chapter, index) => ({
        id: stringValue(chapter.id, index === 0 ? chapterId : `chapter_migrated_${index}`),
        volumeId: stringValue(chapter.volumeId, volumeId),
        name: stringValue(chapter.name, `บทที่ ${index + 1}`),
        pageIds: Array.isArray(chapter.pageIds) ? chapter.pageIds.filter((id): id is string => typeof id === "string") : pageIds,
        order: numberValue(chapter.order, index),
      }))
    : [{ id: chapterId, volumeId, name: "บทที่ 1", pageIds, order: 0 }];
  const volumes = Array.isArray(input.volumes)
    ? input.volumes.filter(isRecord).map((volume, index) => ({
        id: stringValue(volume.id, index === 0 ? volumeId : `volume_migrated_${index}`),
        name: stringValue(volume.name, `เล่ม ${index + 1}`),
        chapterIds: Array.isArray(volume.chapterIds) ? volume.chapterIds.filter((id): id is string => typeof id === "string") : chapters.map((chapter) => chapter.id),
        order: numberValue(volume.order, index),
      }))
    : [{ id: volumeId, name: "เล่ม 1", chapterIds: chapters.map((chapter) => chapter.id), order: 0 }];

  const activePageId = stringValue(input.activePageId, pages[0]?.id ?? fallback.activePageId);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0] ?? fallback.pages[0]!;
  return {
    id: stringValue(input.id, fallback.id),
    name: stringValue(input.name, fallback.name),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    readingDirection: input.readingDirection === "ltr" ? "ltr" : "rtl",
    pagePreset: input.pagePreset === "custom" || input.pagePreset === "webtoon" || input.pagePreset === "a4" || input.pagePreset === "comic" || input.pagePreset === "manga-a5" ? input.pagePreset : "manga-b5",
    dpi: numberValue(input.dpi, 300),
    colorMode: input.colorMode === "cmyk" ? "cmyk" : "rgb",
    bleed: numberValue(input.bleed, 3),
    trim: numberValue(input.trim, 0),
    safeArea: numberValue(input.safeArea, 30),
    gutter: numberValue(input.gutter, 16),
    activePageId: activePage.id,
    activeChapterId: stringValue(input.activeChapterId, activePage.chapterId),
    activeVolumeId: stringValue(input.activeVolumeId, activePage.volumeId),
    volumes,
    chapters,
    pages,
    assets,
    createdAt: stringValue(input.createdAt, fallback.createdAt),
    updatedAt: stringValue(input.updatedAt, fallback.updatedAt),
  };
}

export function serializeProject(project: MangaProject): PersistedProject {
  const pages: PersistedPage[] = project.pages.map((page) => ({
    ...page,
    elements: page.elements.map((element) => {
      if (element.kind !== "image") return element;
      const { src: _src, ...persistedImage } = element;
      return persistedImage;
    }),
  }));
  return {
    ...project,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    assets: project.assets.map(({ src: _src, ...asset }) => asset),
    pages,
  };
}

export function hydrateAssetSources(project: MangaProject, sources: ReadonlyMap<string, string>): void {
  for (const asset of project.assets) {
    const source = sources.get(asset.id);
    if (source) asset.src = source;
  }
  for (const page of project.pages) {
    for (const element of page.elements) {
      if (element.kind !== "image" || !element.assetId) continue;
      const source = sources.get(element.assetId);
      if (source) element.src = source;
    }
  }
}
