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
  if (!selection) return false;
  if (selection.mode === "pixels") return Boolean(selection.spans?.length && selection.width >= 1 && selection.height >= 1);
  return selection.points.length >= 2 && (selection.width >= minimumSize || selection.height >= minimumSize);
}

export function buildContiguousPixelSelection(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number,
): PixelSelectionShape | null {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return null;
  const x = Math.max(0, Math.min(width - 1, Math.floor(startX)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(startY)));
  const startIndex = y * width + x;
  const startOffset = startIndex * 4;
  const target = [pixels[startOffset] ?? 0, pixels[startOffset + 1] ?? 0, pixels[startOffset + 2] ?? 0, pixels[startOffset + 3] ?? 0] as const;
  const threshold = Math.max(0, Math.min(255, tolerance));
  const selected = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const stack = [startIndex];
  visited[startIndex] = 1;
  const maxSelectedPixels = 8_000_000;
  let selectedCount = 0;
  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;
  const matches = (index: number): boolean => {
    const offset = index * 4;
    return Math.max(
      Math.abs((pixels[offset] ?? 0) - target[0]),
      Math.abs((pixels[offset + 1] ?? 0) - target[1]),
      Math.abs((pixels[offset + 2] ?? 0) - target[2]),
      Math.abs((pixels[offset + 3] ?? 0) - target[3]),
    ) <= threshold;
  };
  while (stack.length) {
    const index = stack.pop();
    if (index === undefined) continue;
    if (!matches(index)) continue;
    selected[index] = 1;
    selectedCount += 1;
    if (selectedCount > maxSelectedPixels) return null;
    const currentX = index % width;
    const currentY = Math.floor(index / width);
    minX = Math.min(minX, currentX);
    maxX = Math.max(maxX, currentX);
    minY = Math.min(minY, currentY);
    maxY = Math.max(maxY, currentY);
    const neighbors = [currentX > 0 ? index - 1 : -1, currentX + 1 < width ? index + 1 : -1, currentY > 0 ? index - width : -1, currentY + 1 < height ? index + width : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor]) continue;
      visited[neighbor] = 1;
      stack.push(neighbor);
    }
  }
  const spans: NonNullable<PixelSelectionShape["spans"]> = [];
  for (let row = minY; row <= maxY; row += 1) {
    let column = minX;
    while (column <= maxX) {
      while (column <= maxX && !selected[row * width + column]) column += 1;
      if (column > maxX) break;
      const start = column;
      while (column <= maxX && selected[row * width + column]) column += 1;
      spans.push({ x: start, y: row, width: column - start });
      if (spans.length > 250_000) return null;
    }
  }
  if (!spans.length) return null;
  return {
    mode: "pixels",
    points: [{ x, y, pressure: 1 }],
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    spans,
  };
}

export function rasterStrokeKindForToolId(toolId: string): RasterStrokeKind {
  if (["blur", "sharpen", "dodge", "burn", "sponge", "red-eye"].includes(toolId)) return "filter";
  if (["fill", "enclose-fill", "close-fill", "lasso-fill", "manga-tone", "screentone", "gradient-tone"].includes(toolId)) return "fill";
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
  return toolId === "eraser" || toolId.endsWith("-eraser") || toolId === "tone-scraping";
}
