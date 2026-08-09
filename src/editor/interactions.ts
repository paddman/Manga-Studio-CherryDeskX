import type { PixelSelectionShape, RasterPoint, RasterStrokeKind } from "../types";

export interface ClientPoint {
  clientX: number;
  clientY: number;
  pressure?: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clientToPagePoint(
  point: ClientPoint,
  viewport: ViewportRect,
  pageSize: { width: number; height: number },
): RasterPoint {
  return {
    x: clampNumber((point.clientX - viewport.left) * (pageSize.width / Math.max(1, viewport.width)), 0, pageSize.width),
    y: clampNumber((point.clientY - viewport.top) * (pageSize.height / Math.max(1, viewport.height)), 0, pageSize.height),
    pressure: clampNumber(point.pressure || 1, 0.05, 1),
  };
}

export function rotatedViewportSize(width: number, height: number, zoom: number, rotationDegrees: number): { width: number; height: number } {
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: (width * cosine + height * sine) * zoom,
    height: (width * sine + height * cosine) * zoom,
  };
}

export function clientToRotatedPagePoint(
  point: ClientPoint,
  transformedBounds: ViewportRect,
  pageSize: { width: number; height: number },
  rotationDegrees: number,
): RasterPoint {
  if (Math.abs(rotationDegrees % 360) < 0.001) return clientToPagePoint(point, transformedBounds, pageSize);
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const boundsAtUnitZoom = rotatedViewportSize(pageSize.width, pageSize.height, 1, rotationDegrees);
  const zoomFromWidth = transformedBounds.width / Math.max(1, boundsAtUnitZoom.width);
  const zoomFromHeight = transformedBounds.height / Math.max(1, boundsAtUnitZoom.height);
  const zoom = Math.max(0.001, (zoomFromWidth + zoomFromHeight) / 2);
  const screenX = (point.clientX - (transformedBounds.left + transformedBounds.width / 2)) / zoom;
  const screenY = (point.clientY - (transformedBounds.top + transformedBounds.height / 2)) / zoom;
  const localX = cosine * screenX + sine * screenY + pageSize.width / 2;
  const localY = -sine * screenX + cosine * screenY + pageSize.height / 2;
  return {
    x: clampNumber(localX, 0, pageSize.width),
    y: clampNumber(localY, 0, pageSize.height),
    pressure: clampNumber(point.pressure || 1, 0.05, 1),
  };
}

export function selectionModeForToolId(toolId: string): PixelSelectionShape["mode"] | null {
  if (toolId === "rectangular-marquee") return "rectangle";
  if (toolId === "elliptical-marquee") return "ellipse";
  if (toolId === "lasso" || toolId === "selection-pen") return "lasso";
  if (toolId === "polygonal-lasso") return "polygon";
  return null;
}

export function buildPixelSelection(
  mode: PixelSelectionShape["mode"],
  points: readonly RasterPoint[],
): PixelSelectionShape | null {
  const start = points[0];
  const end = points.at(-1);
  if (!start || !end) return null;
  const shapePoints = mode === "rectangle" || mode === "ellipse" ? [start, end] : [...points];
  const xs = shapePoints.map((point) => point.x);
  const ys = shapePoints.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    mode,
    points: shapePoints.map((point) => ({ ...point })),
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export function isUsablePixelSelection(selection: PixelSelectionShape | null, minimumSize = 3): boolean {
  return Boolean(selection && selection.points.length >= 2 && (selection.width >= minimumSize || selection.height >= minimumSize));
}

export function rasterStrokeKindForToolId(toolId: string): RasterStrokeKind {
  if (["fill", "enclose-fill", "close-fill", "lasso-fill"].includes(toolId)) return "fill";
  if (toolId === "paint-bucket" || toolId === "contiguous-fill") return "bucket";
  if (toolId === "background-eraser" || toolId === "magic-eraser") return "erase-fill";
  if (toolId === "gradient") return "gradient";
  if (["line", "polyline", "curve"].includes(toolId)) return "line";
  if (toolId === "rectangle" || toolId === "rounded-rectangle") return "rectangle";
  if (toolId === "ellipse") return "ellipse";
  if (toolId === "polygon" || toolId === "star") return "polygon";
  return "stroke";
}

export function isEraserToolId(toolId: string): boolean {
  return toolId === "eraser" || toolId.endsWith("-eraser");
}
