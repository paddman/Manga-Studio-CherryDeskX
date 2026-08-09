export type ElementKind = "panel" | "image" | "text" | "bubble";
export type BubbleVariant = "speech" | "thought" | "shout" | "caption";
export type ImageFit = "cover" | "contain" | "stretch";
export type TextAlign = "left" | "center" | "right";
export type ReadingDirection = "ltr" | "rtl";
export type PagePreset = "manga-b5" | "manga-a5" | "comic" | "a4" | "webtoon" | "custom";
export type ColorMode = "rgb" | "cmyk";
export type WritingMode = "horizontal" | "vertical";

export const PROJECT_SCHEMA_VERSION = 2;

export interface CropSettings {
  x: number;
  y: number;
  scale: number;
}

export interface BubbleTail {
  id: string;
  x: number;
  y: number;
}

export interface BaseElement {
  id: string;
  kind: ElementKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  lockAspect: boolean;
  parentId?: string;
  groupId?: string;
  flipX: boolean;
  flipY: boolean;
  readingOrder?: number;
}

export interface PanelElement extends BaseElement {
  kind: "panel";
  background: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  clipChildren: boolean;
}

export interface ImageElement extends BaseElement {
  kind: "image";
  src: string;
  assetId?: string;
  fit: ImageFit;
  borderRadius: number;
  grayscale: number;
  contrast: number;
  crop: CropSettings;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  writingMode: WritingMode;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
}

export interface BubbleElement extends BaseElement {
  kind: "bubble";
  text: string;
  variant: BubbleVariant;
  background: string;
  color: string;
  borderColor: string;
  borderWidth: number;
  fontSize: number;
  fontWeight: number;
  align: TextAlign;
  tailX: number;
  tailY: number;
  tails: BubbleTail[];
}

export type MangaElement = PanelElement | ImageElement | TextElement | BubbleElement;

export interface MangaAsset {
  id: string;
  name: string;
  src: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface MangaPage {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  elements: MangaElement[];
  volumeId: string;
  chapterId: string;
  order: number;
  thumbnailVersion: number;
}

export interface MangaChapter {
  id: string;
  volumeId: string;
  name: string;
  pageIds: string[];
  order: number;
}

export interface MangaVolume {
  id: string;
  name: string;
  chapterIds: string[];
  order: number;
}

export interface MangaProject {
  id: string;
  name: string;
  schemaVersion: number;
  readingDirection: ReadingDirection;
  pagePreset: PagePreset;
  dpi: number;
  colorMode: ColorMode;
  bleed: number;
  trim: number;
  safeArea: number;
  gutter: number;
  activePageId: string;
  activeChapterId: string;
  activeVolumeId: string;
  volumes: MangaVolume[];
  chapters: MangaChapter[];
  pages: MangaPage[];
  assets: MangaAsset[];
  createdAt: string;
  updatedAt: string;
}

export type LeftTab = "assets" | "panels" | "text" | "ai";
export type Tool = "select" | "hand";

export interface EditorPreferences {
  zoom: number;
  showGrid: boolean;
  showSafeArea: boolean;
  preview: boolean;
  leftTab: LeftTab;
  tool: Tool;
  cropElementId: string | null;
}

export interface SelectionGuide {
  axis: "x" | "y";
  position: number;
  label?: string;
}
