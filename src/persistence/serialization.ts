import { createStarterProject } from "../sample";
import type {
  BubbleElement,
  ImageElement,
  MangaAsset,
  MangaElement,
  MangaPage,
  MangaProject,
  PanelElement,
  PixelSelectionShape,
  RasterLayer,
  RasterPoint,
  RasterStroke,
  TextElement,
  TextStylePreset,
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

function colorValue(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function fontFamilyValue(value: unknown): string {
  if (typeof value !== "string") return "system-ui, sans-serif";
  const sanitized = value.replace(/[;{}<>"']/g, "").trim().slice(0, 120);
  return sanitized || "system-ui, sans-serif";
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

function normalizeTextStyle(value: unknown, index: number): TextStylePreset | null {
  if (!isRecord(value) || (value.kind !== "text" && value.kind !== "bubble")) return null;
  return {
    id: stringValue(value.id, `text_style_${index}`),
    name: stringValue(value.name, `สไตล์ ${index + 1}`),
    kind: value.kind,
    fontFamily: fontFamilyValue(value.fontFamily),
    fontSize: Math.max(8, numberValue(value.fontSize, 30)),
    fontWeight: Math.max(100, Math.min(1000, numberValue(value.fontWeight, 700))),
    color: colorValue(value.color, "#17131f"),
    align: value.align === "left" || value.align === "right" ? value.align : "center",
    lineHeight: Math.max(0.6, Math.min(3, numberValue(value.lineHeight, 1.25))),
    letterSpacing: Math.max(-10, Math.min(40, numberValue(value.letterSpacing, 0))),
    writingMode: value.writingMode === "vertical" ? "vertical" : "horizontal",
    outlineColor: colorValue(value.outlineColor, "#000000"),
    outlineWidth: Math.max(0, Math.min(20, numberValue(value.outlineWidth, 0))),
    shadowColor: colorValue(value.shadowColor, "#000000"),
    shadowBlur: Math.max(0, Math.min(60, numberValue(value.shadowBlur, 0))),
    background: typeof value.background === "string" ? colorValue(value.background, "#ffffff") : undefined,
    borderColor: typeof value.borderColor === "string" ? colorValue(value.borderColor, "#17131f") : undefined,
    borderWidth: typeof value.borderWidth === "number" ? Math.max(0, Math.min(30, value.borderWidth)) : undefined,
  };
}

function baseElement(source: JsonRecord, kind: MangaElement["kind"], index: number): Pick<MangaElement, "id" | "kind" | "name" | "x" | "y" | "width" | "height" | "rotation" | "skewX" | "skewY" | "opacity" | "locked" | "hidden" | "lockAspect" | "flipX" | "flipY" | "parentId" | "groupId" | "readingOrder"> {
  return {
    id: stringValue(source.id, `${kind}_migrated_${index}`),
    kind,
    name: stringValue(source.name, kind),
    x: numberValue(source.x, 0),
    y: numberValue(source.y, 0),
    width: Math.max(10, numberValue(source.width, 100)),
    height: Math.max(10, numberValue(source.height, 100)),
    rotation: numberValue(source.rotation, 0),
    skewX: Math.max(-75, Math.min(75, numberValue(source.skewX, 0))),
    skewY: Math.max(-75, Math.min(75, numberValue(source.skewY, 0))),
    opacity: Math.min(1, Math.max(0, numberValue(source.opacity, 1))),
    locked: booleanValue(source.locked, false),
    hidden: booleanValue(source.hidden, false),
    lockAspect: booleanValue(source.lockAspect, false),
    flipX: booleanValue(source.flipX, false),
    flipY: booleanValue(source.flipY, false),
    parentId: typeof source.parentId === "string" ? source.parentId : undefined,
    groupId: typeof source.groupId === "string" ? source.groupId : undefined,
    readingOrder: typeof source.readingOrder === "number" && Number.isFinite(source.readingOrder) ? source.readingOrder : undefined,
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
      background: colorValue(source.background, "#ffffff"),
      borderColor: colorValue(source.borderColor, "#131019"),
      borderWidth: numberValue(source.borderWidth, 8),
      borderRadius: numberValue(source.borderRadius, 2),
      clipChildren: booleanValue(source.clipChildren, true),
    } satisfies PanelElement;
  }
  if (kind === "image") {
    const sourceUrl = imageSource(source.src);
    const matchingAsset = assets.find((asset) => asset.src === sourceUrl);
    const cropSource = isRecord(source.crop) ? source.crop : {};
    const cropScale = Math.max(1, numberValue(cropSource.scale, 1));
    const cropWidth = Math.min(1, Math.max(0.05, numberValue(cropSource.width, 1 / cropScale)));
    const cropHeight = Math.min(1, Math.max(0.05, numberValue(cropSource.height, 1 / cropScale)));
    const cropX = Math.min(1, Math.max(0, numberValue(cropSource.x, 0.5)));
    const cropY = Math.min(1, Math.max(0, numberValue(cropSource.y, 0.5)));
    const cropLeft = Math.min(1 - cropWidth, Math.max(0, numberValue(cropSource.left, cropX - cropWidth / 2)));
    const cropTop = Math.min(1 - cropHeight, Math.max(0, numberValue(cropSource.top, cropY - cropHeight / 2)));
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
        x: cropLeft + cropWidth / 2,
        y: cropTop + cropHeight / 2,
        scale: Math.max(1, 1 / Math.min(cropWidth, cropHeight)),
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight,
      },
    } satisfies ImageElement;
  }
  if (kind === "text") {
    return {
      ...baseElement(source, "text", index),
      kind: "text",
      text: stringValue(source.text, "พิมพ์ข้อความตรงนี้"),
      color: colorValue(source.color, "#17131f"),
      fontSize: numberValue(source.fontSize, 34),
      fontWeight: numberValue(source.fontWeight, 800),
      fontFamily: fontFamilyValue(source.fontFamily),
      align: source.align === "left" || source.align === "right" ? source.align : "center",
      lineHeight: numberValue(source.lineHeight, 1.25),
      letterSpacing: numberValue(source.letterSpacing, 0),
      writingMode: source.writingMode === "vertical" ? "vertical" : "horizontal",
      outlineColor: colorValue(source.outlineColor, "#000000"),
      outlineWidth: numberValue(source.outlineWidth, 0),
      shadowColor: colorValue(source.shadowColor, "#000000"),
      shadowBlur: numberValue(source.shadowBlur, 0),
      autoFit: booleanValue(source.autoFit, false),
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
      variant: source.variant === "thought" || source.variant === "shout" || source.variant === "whisper" || source.variant === "caption" || source.variant === "narration" ? source.variant : "speech",
      background: colorValue(source.background, "#ffffff"),
      color: colorValue(source.color, "#17131f"),
      borderColor: colorValue(source.borderColor, "#17131f"),
      borderWidth: numberValue(source.borderWidth, 5),
      fontSize: numberValue(source.fontSize, 25),
      fontWeight: numberValue(source.fontWeight, 750),
      align: source.align === "left" || source.align === "right" ? source.align : "center",
      fontFamily: fontFamilyValue(source.fontFamily),
      lineHeight: Math.max(0.6, Math.min(3, numberValue(source.lineHeight, 1.26))),
      letterSpacing: Math.max(-10, Math.min(40, numberValue(source.letterSpacing, 0))),
      writingMode: source.writingMode === "vertical" ? "vertical" : "horizontal",
      outlineColor: colorValue(source.outlineColor, "#000000"),
      outlineWidth: Math.max(0, Math.min(20, numberValue(source.outlineWidth, 0))),
      shadowColor: colorValue(source.shadowColor, "#000000"),
      shadowBlur: Math.max(0, Math.min(60, numberValue(source.shadowBlur, 0))),
      autoFit: booleanValue(source.autoFit, true),
      tailX,
      tailY,
      tails: tails.length ? tails : [{ id: `tail_${index}`, x: tailX, y: tailY }],
    } satisfies BubbleElement;
  }
  return null;
}

function normalizePoint(value: unknown): RasterPoint | null {
  if (!isRecord(value)) return null;
  return {
    x: numberValue(value.x, 0),
    y: numberValue(value.y, 0),
    pressure: Math.min(1, Math.max(0.05, numberValue(value.pressure, 1))),
  };
}

function normalizeSelection(value: unknown): PixelSelectionShape | undefined {
  if (!isRecord(value)) return undefined;
  const mode = value.mode === "ellipse" || value.mode === "lasso" || value.mode === "polygon" || value.mode === "pixels" ? value.mode : "rectangle";
  const points = Array.isArray(value.points) ? value.points.map(normalizePoint).filter((point): point is RasterPoint => point !== null) : [];
  const spans = mode === "pixels" && Array.isArray(value.spans)
    ? value.spans.filter(isRecord).map((span) => ({
        x: Math.max(0, Math.floor(numberValue(span.x, 0))),
        y: Math.max(0, Math.floor(numberValue(span.y, 0))),
        width: Math.max(1, Math.floor(numberValue(span.width, 1))),
      })).slice(0, 8_000_000).sort((a, b) => a.y - b.y || a.x - b.x)
    : undefined;
  return {
    mode,
    points,
    x: numberValue(value.x, 0),
    y: numberValue(value.y, 0),
    width: Math.max(0, numberValue(value.width, 0)),
    height: Math.max(0, numberValue(value.height, 0)),
    spans,
  };
}

function normalizeStroke(value: unknown, index: number): RasterStroke | null {
  if (!isRecord(value)) return null;
  const kind = value.kind === "line" || value.kind === "rectangle" || value.kind === "ellipse" || value.kind === "polygon" || value.kind === "fill" || value.kind === "gradient" || value.kind === "bucket" || value.kind === "erase-fill" || value.kind === "filter"
    ? value.kind
    : "stroke";
  const blendMode = value.blendMode === "destination-out" || value.blendMode === "multiply" || value.blendMode === "screen" || value.blendMode === "overlay"
    ? value.blendMode
    : "source-over";
  return {
    id: stringValue(value.id, `stroke_migrated_${index}`),
    kind,
    preset: stringValue(value.preset, "brush"),
    points: Array.isArray(value.points) ? value.points.map(normalizePoint).filter((point): point is RasterPoint => point !== null) : [],
    color: stringValue(value.color, "#17131f"),
    size: Math.max(1, numberValue(value.size, 12)),
    opacity: Math.min(1, Math.max(0, numberValue(value.opacity, 1))),
    blendMode,
    rotation: numberValue(value.rotation, 0),
    selection: normalizeSelection(value.selection),
    preserveAlpha: booleanValue(value.preserveAlpha, false),
    tolerance: Math.min(255, Math.max(0, numberValue(value.tolerance, 24))),
  };
}

function normalizeRasterLayer(value: unknown, index: number, pageWidth: number, pageHeight: number): RasterLayer | null {
  if (!isRecord(value)) return null;
  const strokes = Array.isArray(value.strokes)
    ? value.strokes.map(normalizeStroke).filter((stroke): stroke is RasterStroke => stroke !== null)
    : [];
  const maskRecord = isRecord(value.mask) ? value.mask : null;
  const maskSelection = maskRecord ? normalizeSelection(maskRecord.selection) : undefined;
  return {
    id: stringValue(value.id, `raster_migrated_${index}`),
    kind: "raster",
    name: stringValue(value.name, `Raster ${index + 1}`),
    width: Math.max(1, numberValue(value.width, pageWidth)),
    height: Math.max(1, numberValue(value.height, pageHeight)),
    opacity: Math.min(1, Math.max(0, numberValue(value.opacity, 1))),
    hidden: booleanValue(value.hidden, false),
    locked: booleanValue(value.locked, false),
    alphaLock: booleanValue(value.alphaLock, false),
    blendMode: value.blendMode === "destination-out" || value.blendMode === "multiply" || value.blendMode === "screen" || value.blendMode === "overlay" ? value.blendMode : "source-over",
    strokes,
    bitmapKey: typeof value.bitmapKey === "string" ? value.bitmapKey : undefined,
    mask: maskSelection ? { enabled: booleanValue(maskRecord?.enabled, true), inverted: booleanValue(maskRecord?.inverted, false), selection: maskSelection } : undefined,
  };
}

function normalizePage(value: unknown, index: number, volumeId: string, chapterId: string, assets: MangaAsset[]): MangaPage {
  const source = isRecord(value) ? value : {};
  const elements = Array.isArray(source.elements)
    ? source.elements.map((element, elementIndex) => normalizeElement(element, elementIndex, assets)).filter((element): element is MangaElement => element !== null)
    : [];
  const width = Math.max(320, numberValue(source.width, 794));
  const height = Math.max(320, numberValue(source.height, 1123));
  const rasterLayers = Array.isArray(source.rasterLayers)
    ? source.rasterLayers.map((layer, layerIndex) => normalizeRasterLayer(layer, layerIndex, width, height)).filter((layer): layer is RasterLayer => layer !== null)
    : [];
  const rawOrder = Array.isArray(source.layerOrder) ? source.layerOrder.filter((id): id is string => typeof id === "string") : [];
  const availableIds = [...elements.map((element) => element.id), ...rasterLayers.map((layer) => layer.id)];
  const layerOrder = [...new Set([...rawOrder, ...availableIds])].filter((id) => availableIds.includes(id));
  return {
    id: stringValue(source.id, `page_migrated_${index}`),
    name: stringValue(source.name, `หน้า ${index + 1}`),
    width,
    height,
    background: colorValue(source.background, "#f7f5fb"),
    elements,
    rasterLayers,
    layerOrder,
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
  const textStyles = Array.isArray(input.textStyles) ? input.textStyles.map(normalizeTextStyle).filter((style): style is TextStylePreset => style !== null) : [];
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
    textStyles,
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
