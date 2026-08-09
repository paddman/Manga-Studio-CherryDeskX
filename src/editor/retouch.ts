import type { PixelSelectionShape, RasterPoint } from "../types";

export type LocalRetouchPreset = "blur" | "sharpen" | "dodge" | "burn" | "sponge" | "red-eye";

export interface RetouchPixelOptions {
  preset: LocalRetouchPreset;
  points: readonly RasterPoint[];
  size: number;
  opacity: number;
  selection?: PixelSelectionShape;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function pointInSelection(x: number, y: number, selection: PixelSelectionShape | undefined): boolean {
  if (!selection) return true;
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
  if (selection.mode === "rectangle") return x >= selection.x && x <= selection.x + selection.width && y >= selection.y && y <= selection.y + selection.height;
  if (selection.mode === "ellipse") {
    const radiusX = Math.max(1, selection.width / 2);
    const radiusY = Math.max(1, selection.height / 2);
    const dx = (x - selection.x - radiusX) / radiusX;
    const dy = (y - selection.y - radiusY) / radiusY;
    return dx * dx + dy * dy <= 1;
  }
  let inside = false;
  for (let current = 0, previous = selection.points.length - 1; current < selection.points.length; previous = current, current += 1) {
    const currentPoint = selection.points[current];
    const previousPoint = selection.points[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects = (currentPoint.y > y) !== (previousPoint.y > y)
      && x < ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pixelOffset(width: number, height: number, x: number, y: number): number {
  const safeX = Math.max(0, Math.min(width - 1, x));
  const safeY = Math.max(0, Math.min(height - 1, y));
  return (safeY * width + safeX) * 4;
}

function channel(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, component: number): number {
  return source[pixelOffset(width, height, x, y) + component] ?? 0;
}

function filteredChannel(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, component: number, preset: "blur" | "sharpen"): number {
  const center = channel(source, width, height, x, y, component);
  const north = channel(source, width, height, x, y - 1, component);
  const south = channel(source, width, height, x, y + 1, component);
  const west = channel(source, width, height, x - 1, y, component);
  const east = channel(source, width, height, x + 1, y, component);
  if (preset === "sharpen") return clampByte(center * 5 - north - south - west - east);
  const northwest = channel(source, width, height, x - 1, y - 1, component);
  const northeast = channel(source, width, height, x + 1, y - 1, component);
  const southwest = channel(source, width, height, x - 1, y + 1, component);
  const southeast = channel(source, width, height, x + 1, y + 1, component);
  return (center + north + south + west + east + northwest + northeast + southwest + southeast) / 9;
}

function targetRgb(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, preset: LocalRetouchPreset): readonly [number, number, number] {
  const offset = pixelOffset(width, height, x, y);
  const red = source[offset] ?? 0;
  const green = source[offset + 1] ?? 0;
  const blue = source[offset + 2] ?? 0;
  if (preset === "blur" || preset === "sharpen") {
    return [
      filteredChannel(source, width, height, x, y, 0, preset),
      filteredChannel(source, width, height, x, y, 1, preset),
      filteredChannel(source, width, height, x, y, 2, preset),
    ];
  }
  if (preset === "dodge") return [red + (255 - red) * 0.38, green + (255 - green) * 0.38, blue + (255 - blue) * 0.38];
  if (preset === "burn") return [red * 0.62, green * 0.62, blue * 0.62];
  if (preset === "sponge") {
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    return [luminance + (red - luminance) * 1.55, luminance + (green - luminance) * 1.55, luminance + (blue - luminance) * 1.55];
  }
  if (red > green * 1.22 && red > blue * 1.22) return [(green + blue) / 2, green, blue];
  return [red, green, blue];
}

export function isLocalRetouchPreset(value: string): value is LocalRetouchPreset {
  return value === "blur" || value === "sharpen" || value === "dodge" || value === "burn" || value === "sponge" || value === "red-eye";
}

/** Applies a deterministic, replayable brush mask directly to RGBA pixels. */
export function applyRetouchPixels(pixels: Uint8ClampedArray, width: number, height: number, options: RetouchPixelOptions): number {
  if (width < 1 || height < 1 || pixels.length < width * height * 4 || !options.points.length) return 0;
  const source = pixels.slice();
  const maximumRadius = Math.max(1, options.size / 2);
  let pointMinX = options.points[0]?.x ?? 0;
  let pointMaxX = pointMinX;
  let pointMinY = options.points[0]?.y ?? 0;
  let pointMaxY = pointMinY;
  for (const point of options.points) {
    pointMinX = Math.min(pointMinX, point.x);
    pointMaxX = Math.max(pointMaxX, point.x);
    pointMinY = Math.min(pointMinY, point.y);
    pointMaxY = Math.max(pointMaxY, point.y);
  }
  const minX = Math.max(0, Math.floor(pointMinX - maximumRadius));
  const maxX = Math.min(width - 1, Math.ceil(pointMaxX + maximumRadius));
  const minY = Math.max(0, Math.floor(pointMinY - maximumRadius));
  const maxY = Math.min(height - 1, Math.ceil(pointMaxY + maximumRadius));
  const maskWidth = maxX - minX + 1;
  const maskHeight = maxY - minY + 1;
  if (maskWidth < 1 || maskHeight < 1) return 0;
  const influenceMask = new Uint8Array(maskWidth * maskHeight);
  const opacity = Math.max(0, Math.min(1, options.opacity));

  const stamp = (point: RasterPoint): void => {
    const radius = Math.max(1, maximumRadius * Math.max(0.05, point.pressure));
    const left = Math.max(minX, Math.floor(point.x - radius));
    const right = Math.min(maxX, Math.ceil(point.x + radius));
    const top = Math.max(minY, Math.floor(point.y - radius));
    const bottom = Math.min(maxY, Math.ceil(point.y + radius));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (!pointInSelection(x, y, options.selection)) continue;
        const distance = Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y);
        if (distance > radius) continue;
        const influence = Math.round(Math.max(0, 1 - distance / radius) * opacity * 255);
        const maskIndex = (y - minY) * maskWidth + x - minX;
        if (influence > (influenceMask[maskIndex] ?? 0)) influenceMask[maskIndex] = influence;
      }
    }
  };
  for (const [index, point] of options.points.entries()) {
    const previous = options.points[index - 1];
    if (!previous) {
      stamp(point);
      continue;
    }
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, maximumRadius * 0.45)));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      stamp({
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
        pressure: previous.pressure + (point.pressure - previous.pressure) * ratio,
      });
    }
  }

  let changed = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const influence = (influenceMask[(y - minY) * maskWidth + x - minX] ?? 0) / 255;
      if (influence <= 0) continue;
      const offset = pixelOffset(width, height, x, y);
      if ((source[offset + 3] ?? 0) === 0) continue;
      const target = targetRgb(source, width, height, x, y, options.preset);
      let pixelChanged = false;
      for (let component = 0; component < 3; component += 1) {
        const original = source[offset + component] ?? 0;
        const result = clampByte(original + ((target[component] ?? original) - original) * influence);
        if (result !== original) pixelChanged = true;
        pixels[offset + component] = result;
      }
      if (pixelChanged) changed += 1;
    }
  }
  return changed;
}
