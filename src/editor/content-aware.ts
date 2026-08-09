import type { PixelSelectionShape } from "../types";

export const MAX_LOCAL_CONTENT_AWARE_PIXELS = 1_500_000;

function pointInSelection(x: number, y: number, selection: PixelSelectionShape): boolean {
  if (selection.mode === "pixels") {
    const spans = selection.spans ?? [];
    let low = 0;
    let high = spans.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((spans[middle]?.y ?? Number.MAX_SAFE_INTEGER) < y) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < spans.length && spans[index]?.y === y; index += 1) {
      const span = spans[index];
      if (span && x >= span.x && x < span.x + span.width) return true;
    }
    return false;
  }
  if (selection.mode === "rectangle") return x >= selection.x && x < selection.x + selection.width && y >= selection.y && y < selection.y + selection.height;
  if (selection.mode === "ellipse") {
    const radiusX = Math.max(1, selection.width / 2);
    const radiusY = Math.max(1, selection.height / 2);
    const dx = (x + 0.5 - selection.x - radiusX) / radiusX;
    const dy = (y + 0.5 - selection.y - radiusY) / radiusY;
    return dx * dx + dy * dy <= 1;
  }
  let inside = false;
  for (let current = 0, previous = selection.points.length - 1; current < selection.points.length; previous = current, current += 1) {
    const currentPoint = selection.points[current];
    const previousPoint = selection.points[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects = (currentPoint.y > y + 0.5) !== (previousPoint.y > y + 0.5)
      && x + 0.5 < ((previousPoint.x - currentPoint.x) * (y + 0.5 - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function contentAwareSelectionArea(selection: PixelSelectionShape): number {
  if (selection.mode === "pixels") return (selection.spans ?? []).reduce((total, span) => total + span.width, 0);
  return Math.max(0, Math.ceil(selection.width)) * Math.max(0, Math.ceil(selection.height));
}

function rgbaOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/**
 * Deterministic local inpainting. Boundary colours propagate inward through the
 * selected mask. It is intentionally a browser-safe fallback, not semantic AI.
 */
export function contentAwareFillPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  selection: PixelSelectionShape,
  opacity = 1,
  preserveAlpha = false,
): number {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return 0;
  const estimatedArea = contentAwareSelectionArea(selection);
  if (estimatedArea < 1 || estimatedArea > MAX_LOCAL_CONTENT_AWARE_PIXELS) return 0;
  const minX = Math.max(0, Math.floor(selection.x));
  const minY = Math.max(0, Math.floor(selection.y));
  const maxX = Math.min(width - 1, Math.ceil(selection.x + selection.width) - 1);
  const maxY = Math.min(height - 1, Math.ceil(selection.y + selection.height) - 1);
  const maskWidth = maxX - minX + 1;
  const maskHeight = maxY - minY + 1;
  if (maskWidth < 1 || maskHeight < 1) return 0;
  const source = pixels.slice();
  const selected = new Uint8Array(maskWidth * maskHeight);
  const filled = new Uint8Array(maskWidth * maskHeight);
  const queue = new Int32Array(Math.min(MAX_LOCAL_CONTENT_AWARE_PIXELS, maskWidth * maskHeight));
  let selectedCount = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInSelection(x, y, selection)) continue;
      selected[(y - minY) * maskWidth + x - minX] = 1;
      selectedCount += 1;
      if (selectedCount > MAX_LOCAL_CONTENT_AWARE_PIXELS) return 0;
    }
  }
  if (!selectedCount) return 0;

  const directions = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
  const blend = Math.max(0, Math.min(1, opacity));
  let changed = 0;
  let head = 0;
  let tail = 0;
  const fillFromNeighbors = (x: number, y: number, requireOutside: boolean): boolean => {
    const totals = [0, 0, 0, 0];
    let count = 0;
    for (const [dx, dy] of directions) {
      const sampleX = x + dx;
      const sampleY = y + dy;
      if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
      const localX = sampleX - minX;
      const localY = sampleY - minY;
      const insideBounds = localX >= 0 && localY >= 0 && localX < maskWidth && localY < maskHeight;
      const localIndex = insideBounds ? localY * maskWidth + localX : -1;
      const isSelected = localIndex >= 0 && selected[localIndex] === 1;
      if (requireOutside ? isSelected : isSelected && filled[localIndex] !== 1) continue;
      const offset = rgbaOffset(width, sampleX, sampleY);
      for (let component = 0; component < 4; component += 1) totals[component] = (totals[component] ?? 0) + (pixels[offset + component] ?? 0);
      count += 1;
    }
    if (!count) return false;
    const offset = rgbaOffset(width, x, y);
    const components = preserveAlpha ? 3 : 4;
    let pixelChanged = false;
    for (let component = 0; component < components; component += 1) {
      const original = source[offset + component] ?? 0;
      const result = Math.round(original + ((totals[component] ?? 0) / count - original) * blend);
      if (result !== original) pixelChanged = true;
      pixels[offset + component] = result;
    }
    if (pixelChanged) changed += 1;
    return true;
  };

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const localIndex = (y - minY) * maskWidth + x - minX;
      if (!selected[localIndex] || !fillFromNeighbors(x, y, true)) continue;
      filled[localIndex] = 1;
      queue[tail] = localIndex;
      tail += 1;
    }
  }
  if (!tail) return 0;

  while (head < tail) {
    const localIndex = queue[head];
    head += 1;
    if (localIndex === undefined) continue;
    const localX = localIndex % maskWidth;
    const localY = Math.floor(localIndex / maskWidth);
    const propagationDirections = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
    for (const [dx, dy] of propagationDirections) {
      const nextX = localX + dx;
      const nextY = localY + dy;
      if (nextX < 0 || nextY < 0 || nextX >= maskWidth || nextY >= maskHeight) continue;
      const nextIndex = nextY * maskWidth + nextX;
      if (!selected[nextIndex] || filled[nextIndex]) continue;
      const pageX = minX + nextX;
      const pageY = minY + nextY;
      if (!fillFromNeighbors(pageX, pageY, false)) continue;
      filled[nextIndex] = 1;
      queue[tail] = nextIndex;
      tail += 1;
    }
  }
  return changed;
}
