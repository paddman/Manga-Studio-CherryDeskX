import type { MangaPage, PagePreset, PixelSelectionShape, RasterPoint } from "../types";
import { activePage, runtime, transact } from "./state";

export interface PagePresetDefinition {
  id: PagePreset;
  label: string;
  width: number | null;
  height: number | null;
  recommendedDpi: number;
}

export const PAGE_PRESETS: readonly PagePresetDefinition[] = [
  { id: "manga-b5", label: "Manga B5", width: 1760, height: 2508, recommendedDpi: 300 },
  { id: "manga-a5", label: "Manga A5", width: 1748, height: 2480, recommendedDpi: 300 },
  { id: "comic", label: "US Comic", width: 1988, height: 3056, recommendedDpi: 300 },
  { id: "a4", label: "A4", width: 2480, height: 3508, recommendedDpi: 300 },
  { id: "webtoon", label: "Webtoon", width: 1080, height: 1920, recommendedDpi: 144 },
  { id: "custom", label: "กำหนดเอง", width: null, height: null, recommendedDpi: 300 },
];

function scalePoint(point: RasterPoint, scaleX: number, scaleY: number): void {
  point.x *= scaleX;
  point.y *= scaleY;
}

function scaleSelection(selection: PixelSelectionShape | undefined, scaleX: number, scaleY: number): void {
  if (!selection) return;
  selection.x *= scaleX;
  selection.y *= scaleY;
  selection.width *= scaleX;
  selection.height *= scaleY;
  selection.points.forEach((point) => scalePoint(point, scaleX, scaleY));
}

export function resizePageContent(page: MangaPage, width: number, height: number): void {
  const nextWidth = Math.max(320, Math.min(5000, Math.round(width)));
  const nextHeight = Math.max(320, Math.min(8000, Math.round(height)));
  const scaleX = nextWidth / Math.max(1, page.width);
  const scaleY = nextHeight / Math.max(1, page.height);
  const geometricScale = Math.sqrt(scaleX * scaleY);

  for (const element of page.elements) {
    element.x *= scaleX;
    element.y *= scaleY;
    element.width *= scaleX;
    element.height *= scaleY;
    if (element.kind === "panel") {
      element.borderWidth *= geometricScale;
      element.borderRadius *= geometricScale;
    }
    if (element.kind === "image") element.borderRadius *= geometricScale;
    if (element.kind === "text") {
      element.fontSize *= geometricScale;
      element.letterSpacing *= geometricScale;
      element.outlineWidth *= geometricScale;
      element.shadowBlur *= geometricScale;
    }
    if (element.kind === "bubble") {
      element.borderWidth *= geometricScale;
      element.fontSize *= geometricScale;
      element.tailX *= scaleX;
      element.tailY *= scaleY;
      element.tails.forEach((tail) => {
        tail.x *= scaleX;
        tail.y *= scaleY;
      });
    }
  }

  for (const layer of page.rasterLayers) {
    layer.width = nextWidth;
    layer.height = nextHeight;
    for (const stroke of layer.strokes) {
      stroke.points.forEach((point) => scalePoint(point, scaleX, scaleY));
      stroke.size *= geometricScale;
      scaleSelection(stroke.selection, scaleX, scaleY);
    }
    scaleSelection(layer.mask?.selection, scaleX, scaleY);
  }

  page.width = nextWidth;
  page.height = nextHeight;
  page.thumbnailVersion += 1;
}

export function applyPagePreset(presetId: PagePreset): boolean {
  const preset = PAGE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return false;
  transact(() => {
    runtime.project.pagePreset = preset.id;
    if (preset.width && preset.height) resizePageContent(activePage(), preset.width, preset.height);
    if (preset.id === "webtoon" && runtime.project.dpi > preset.recommendedDpi) runtime.project.dpi = preset.recommendedDpi;
  });
  return true;
}

export type DocumentMetadataProperty = "dpi" | "colorMode" | "bleed" | "trim" | "safeArea" | "gutter";

export function setDocumentMetadata(property: DocumentMetadataProperty, rawValue: string): boolean {
  if (property === "colorMode") {
    if (rawValue !== "rgb" && rawValue !== "cmyk") return false;
    transact(() => { runtime.project.colorMode = rawValue; });
    return true;
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return false;
  transact(() => {
    if (property === "dpi") runtime.project.dpi = Math.max(72, Math.min(1200, Math.round(value)));
    if (property === "bleed") runtime.project.bleed = Math.max(0, Math.min(30, value));
    if (property === "trim") runtime.project.trim = Math.max(0, Math.min(30, value));
    if (property === "safeArea") runtime.project.safeArea = Math.max(0, Math.min(500, Math.round(value)));
    if (property === "gutter") runtime.project.gutter = Math.max(0, Math.min(500, Math.round(value)));
  });
  return true;
}
