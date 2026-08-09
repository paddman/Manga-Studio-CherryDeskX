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
