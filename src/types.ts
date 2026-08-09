export type ElementKind = "panel" | "image" | "text" | "bubble";
export type BubbleVariant = "speech" | "thought" | "shout" | "caption";
export type ImageFit = "cover" | "contain" | "stretch";
export type TextAlign = "left" | "center" | "right";
export type ReadingDirection = "ltr" | "rtl";

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
}

export interface PanelElement extends BaseElement {
  kind: "panel";
  background: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export interface ImageElement extends BaseElement {
  kind: "image";
  src: string;
  fit: ImageFit;
  borderRadius: number;
  grayscale: number;
  contrast: number;
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
}

export type MangaElement = PanelElement | ImageElement | TextElement | BubbleElement;

export interface MangaAsset {
  id: string;
  name: string;
  src: string;
  createdAt: string;
}

export interface MangaPage {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  elements: MangaElement[];
}

export interface MangaProject {
  id: string;
  name: string;
  readingDirection: ReadingDirection;
  activePageId: string;
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
}
