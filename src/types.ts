export type ElementKind = "panel" | "image" | "text" | "bubble";
export type BubbleVariant = "speech" | "thought" | "shout" | "whisper" | "caption" | "narration";
export type ImageFit = "cover" | "contain" | "stretch";
export type TextAlign = "left" | "center" | "right";
export type ReadingDirection = "ltr" | "rtl";
export type PagePreset = "manga-b5" | "manga-a5" | "comic" | "a4" | "webtoon" | "custom";
export type ColorMode = "rgb" | "cmyk";
export type WritingMode = "horizontal" | "vertical";
export type ExportFormat = "png" | "jpg" | "pdf" | "cbz" | "zip" | "webtoon";
export type ExportScope = "page" | "chapter" | "volume" | "project";
export type ExportScaleMode = "1x" | "2x" | "300dpi" | "custom";

export const PROJECT_SCHEMA_VERSION = 6;

export type ToolId = string & { readonly __toolId: unique symbol };
export type Tool = ToolId;

export type RasterStrokeKind = "stroke" | "line" | "rectangle" | "ellipse" | "polygon" | "fill" | "gradient" | "bucket" | "erase-fill" | "filter" | "content-fill";
export type RasterBlendMode = "source-over" | "destination-out" | "multiply" | "screen" | "overlay";

export interface RasterPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface PixelSelectionSpan {
  x: number;
  y: number;
  width: number;
}

export interface PixelSelectionShape {
  mode: "rectangle" | "ellipse" | "lasso" | "polygon" | "pixels";
  points: RasterPoint[];
  x: number;
  y: number;
  width: number;
  height: number;
  spans?: PixelSelectionSpan[];
}

export interface RasterStroke {
  id: string;
  kind: RasterStrokeKind;
  preset: string;
  points: RasterPoint[];
  color: string;
  size: number;
  opacity: number;
  blendMode: RasterBlendMode;
  rotation?: number;
  selection?: PixelSelectionShape;
  preserveAlpha?: boolean;
  tolerance?: number;
  mirrorAxis?: RasterRulerAxis;
}

export interface RasterRulerAxis {
  kind: "straight" | "symmetry";
  start: RasterPoint;
  end: RasterPoint;
}

export interface RasterLayer {
  id: string;
  kind: "raster";
  name: string;
  width: number;
  height: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
  alphaLock: boolean;
  blendMode: RasterBlendMode;
  strokes: RasterStroke[];
  bitmapKey?: string;
  mask?: RasterLayerMask;
}

export interface RasterLayerMask {
  enabled: boolean;
  inverted: boolean;
  selection: PixelSelectionShape;
}

export interface CropSettings {
  x: number;
  y: number;
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
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
  skewX: number;
  skewY: number;
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
  autoFit: boolean;
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
  fontFamily: string;
  lineHeight: number;
  letterSpacing: number;
  writingMode: WritingMode;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  autoFit: boolean;
  tailX: number;
  tailY: number;
  tails: BubbleTail[];
}

export type MangaElement = PanelElement | ImageElement | TextElement | BubbleElement;

export interface TextStylePreset {
  id: string;
  name: string;
  kind: "text" | "bubble";
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  writingMode: WritingMode;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface MangaAsset {
  id: string;
  kind: "image" | "font";
  name: string;
  src: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  fontFamily?: string;
  createdAt: string;
}

export interface MangaPage {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  elements: MangaElement[];
  rasterLayers: RasterLayer[];
  layerOrder: string[];
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
  textStyles: TextStylePreset[];
  createdAt: string;
  updatedAt: string;
}

export type LeftTab = "assets" | "panels" | "text" | "ai";
export interface EditorPreferences {
  zoom: number;
  showGrid: boolean;
  showSafeArea: boolean;
  preview: boolean;
  leftTab: LeftTab;
  tool: Tool;
  cropElementId: string | null;
  brushColor: string;
  brushSize: number;
  brushOpacity: number;
  activeRasterLayerId: string | null;
  exportTransparent: boolean;
  exportBackgroundColor: string;
  exportFormat: ExportFormat;
  exportScope: ExportScope;
  exportScaleMode: ExportScaleMode;
  exportCustomScale: number;
  exportMaxWebtoonHeight: number;
  exportIncludeBleed: boolean;
  exportCropMarks: boolean;
  canvasRotation: number;
  showNavigator: boolean;
  rasterRuler: RasterRulerAxis | null;
}

export interface SelectionGuide {
  axis: "x" | "y";
  position: number;
  label?: string;
}
