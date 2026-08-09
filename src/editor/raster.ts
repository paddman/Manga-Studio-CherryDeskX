import { brushPreset } from "./tools";
import type { MangaPage, PixelSelectionShape, RasterLayer, RasterPoint, RasterStroke } from "../types";
import { isRasterLayer, orderedPageLayers } from "./layers";
import { applyRetouchPixels, isLocalRetouchPreset } from "./retouch";
import { mirrorPointAcrossRuler } from "./interactions";
import { contentAwareFillPixels } from "./content-aware";

export const MAX_RASTER_DIMENSION = 16_384;
export const MAX_RASTER_PIXELS = 32_000_000;

export function rasterDimensionError(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return "ขนาด Raster ไม่ถูกต้อง";
  if (width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION) return `Raster รองรับด้านละไม่เกิน ${MAX_RASTER_DIMENSION.toLocaleString()} px`;
  if (width * height > MAX_RASTER_PIXELS) return `Raster รองรับไม่เกิน ${MAX_RASTER_PIXELS.toLocaleString()} pixels ต่อหน้า`;
  return null;
}

function drawPolyline(ctx: CanvasRenderingContext2D, points: RasterPoint[]): void {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  if (points.length === 1) ctx.lineTo(first.x + 0.01, first.y + 0.01);
  ctx.stroke();
}

function selectionPath(ctx: CanvasRenderingContext2D, selection: PixelSelectionShape): void {
  ctx.beginPath();
  if (selection.mode === "pixels") {
    for (const span of selection.spans ?? []) ctx.rect(span.x, span.y, span.width, 1);
    return;
  }
  if (selection.mode === "rectangle") {
    ctx.rect(selection.x, selection.y, selection.width, selection.height);
    return;
  }
  if (selection.mode === "ellipse") {
    ctx.ellipse(selection.x + selection.width / 2, selection.y + selection.height / 2, Math.max(1, selection.width / 2), Math.max(1, selection.height / 2), 0, 0, Math.PI * 2);
    return;
  }
  const first = selection.points[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (const point of selection.points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function withSelection(ctx: CanvasRenderingContext2D, selection: PixelSelectionShape | undefined, draw: () => void): void {
  if (!selection) {
    draw();
    return;
  }
  ctx.save();
  selectionPath(ctx, selection);
  ctx.clip();
  draw();
  ctx.restore();
}

function pointInSelection(x: number, y: number, selection: PixelSelectionShape | undefined): boolean {
  if (!selection) return true;
  if (selection.mode === "pixels") {
    const spans = selection.spans ?? [];
    const row = Math.floor(y);
    let low = 0;
    let high = spans.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((spans[middle]?.y ?? Number.MAX_SAFE_INTEGER) < row) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < spans.length && spans[index]?.y === row; index += 1) {
      const span = spans[index]!;
      if (x >= span.x && x < span.x + span.width) return true;
    }
    return false;
  }
  if (selection.mode === "rectangle") return x >= selection.x && x <= selection.x + selection.width && y >= selection.y && y <= selection.y + selection.height;
  if (selection.mode === "ellipse") {
    const radiusX = Math.max(1, selection.width / 2);
    const radiusY = Math.max(1, selection.height / 2);
    const dx = (x - (selection.x + radiusX)) / radiusX;
    const dy = (y - (selection.y + radiusY)) / radiusY;
    return dx * dx + dy * dy <= 1;
  }
  let inside = false;
  const points = selection.points;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
    const currentPoint = points[current];
    const previousPoint = points[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects = (currentPoint.y > y) !== (previousPoint.y > y)
      && x < ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function parseHexColor(color: string): [number, number, number] {
  const normalized = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized.split("").map((value) => Number.parseInt(`${value}${value}`, 16)) as [number, number, number];
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)) as [number, number, number];
  }
  return [0, 0, 0];
}

export interface FloodFillOptions {
  startX: number;
  startY: number;
  color: string;
  opacity: number;
  tolerance: number;
  erase: boolean;
  selection?: PixelSelectionShape;
}

export function floodFillPixels(pixels: Uint8ClampedArray, width: number, height: number, options: FloodFillOptions): number {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return 0;
  const startX = Math.min(width - 1, Math.max(0, Math.floor(options.startX)));
  const startY = Math.min(height - 1, Math.max(0, Math.floor(options.startY)));
  if (!pointInSelection(startX, startY, options.selection)) return 0;
  const startOffset = (startY * width + startX) * 4;
  const target = [pixels[startOffset] ?? 0, pixels[startOffset + 1] ?? 0, pixels[startOffset + 2] ?? 0, pixels[startOffset + 3] ?? 0] as const;
  const replacement = parseHexColor(options.color);
  const opacity = Math.min(1, Math.max(0, options.opacity));
  if (options.erase && target[3] === 0) return 0;
  if (!options.erase && opacity === 1 && target[0] === replacement[0] && target[1] === replacement[1] && target[2] === replacement[2] && target[3] === 255) return 0;
  const tolerance = Math.min(255, Math.max(0, options.tolerance));
  const visited = new Uint8Array(width * height);
  const stack: number[] = [startY * width + startX];
  let changed = 0;
  const matches = (index: number): boolean => {
    if (visited[index]) return false;
    const offset = index * 4;
    return Math.max(
      Math.abs((pixels[offset] ?? 0) - target[0]),
      Math.abs((pixels[offset + 1] ?? 0) - target[1]),
      Math.abs((pixels[offset + 2] ?? 0) - target[2]),
      Math.abs((pixels[offset + 3] ?? 0) - target[3]),
    ) <= tolerance;
  };
  const replace = (index: number): void => {
    const offset = index * 4;
    if (options.erase) {
      pixels[offset + 3] = Math.round((pixels[offset + 3] ?? 0) * (1 - opacity));
      return;
    }
    pixels[offset] = Math.round(replacement[0] * opacity + (pixels[offset] ?? 0) * (1 - opacity));
    pixels[offset + 1] = Math.round(replacement[1] * opacity + (pixels[offset + 1] ?? 0) * (1 - opacity));
    pixels[offset + 2] = Math.round(replacement[2] * opacity + (pixels[offset + 2] ?? 0) * (1 - opacity));
    pixels[offset + 3] = Math.round(255 * opacity + (pixels[offset + 3] ?? 0) * (1 - opacity));
  };
  while (stack.length) {
    const seed = stack.pop();
    if (seed === undefined || !matches(seed)) continue;
    const seedY = Math.floor(seed / width);
    let x = seed % width;
    while (x > 0) {
      const previous = seedY * width + x - 1;
      if (!matches(previous) || !pointInSelection(x - 1, seedY, options.selection)) break;
      x -= 1;
    }
    for (; x < width; x += 1) {
      const index = seedY * width + x;
      if (!matches(index) || !pointInSelection(x, seedY, options.selection)) break;
      visited[index] = 1;
      replace(index);
      changed += 1;
      if (seedY > 0) {
        const above = index - width;
        if (matches(above) && pointInSelection(x, seedY - 1, options.selection)) stack.push(above);
      }
      if (seedY + 1 < height) {
        const below = index + width;
        if (matches(below) && pointInSelection(x, seedY + 1, options.selection)) stack.push(below);
      }
    }
  }
  return changed;
}

function floodFill(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number, erase: boolean): void {
  const point = stroke.points[0];
  if (!point) return;
  const image = ctx.getImageData(0, 0, width, height);
  const changed = floodFillPixels(image.data, width, height, {
    startX: point.x,
    startY: point.y,
    color: stroke.color,
    opacity: stroke.opacity,
    tolerance: stroke.tolerance ?? 24,
    erase,
    selection: stroke.selection,
  });
  if (!changed) return;
  ctx.putImageData(image, 0, 0);
}

function drawSoftStamp(ctx: CanvasRenderingContext2D, point: RasterPoint, size: number, color: string, opacity: number, hardness: number): void {
  const radius = Math.max(0.5, size * point.pressure / 2);
  const gradient = ctx.createRadialGradient(point.x, point.y, radius * Math.max(0.02, hardness), point.x, point.y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, `${color}00`);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpray(ctx: CanvasRenderingContext2D, points: RasterPoint[], size: number, color: string, opacity: number): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  for (const [pointIndex, point] of points.entries()) {
    const dots = Math.max(8, Math.round(size / 2));
    for (let index = 0; index < dots; index += 1) {
      const angle = (index * 2.399963 + pointIndex * 0.71) % (Math.PI * 2);
      const distance = ((index * 17 + pointIndex * 13) % 101) / 100 * size;
      ctx.fillRect(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance, 1, 1);
    }
  }
}

function drawMangaEffectStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number, points: RasterPoint[]): boolean {
  const start = points[0];
  const end = points.at(-1);
  if (!start || !end) return false;
  if (stroke.preset === "focus-line") {
    const radius = Math.max(width, height) * 1.1;
    const gap = Math.max(18, Math.hypot(end.x - start.x, end.y - start.y) * 0.22);
    for (let index = 0; index < 28; index += 1) {
      const angle = (Math.PI * 2 * index) / 28;
      const lengthVariation = 0.72 + ((index * 17) % 9) / 30;
      ctx.beginPath();
      ctx.moveTo(end.x + Math.cos(angle) * radius * lengthVariation, end.y + Math.sin(angle) * radius * lengthVariation);
      ctx.lineTo(end.x + Math.cos(angle) * gap, end.y + Math.sin(angle) * gap);
      ctx.stroke();
    }
    return true;
  }
  if (stroke.preset === "speed-line") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const perpendicularX = -dy / length;
    const perpendicularY = dx / length;
    for (let index = -5; index <= 5; index += 1) {
      const offset = index * Math.max(5, stroke.size * 1.8);
      const inset = Math.abs(index % 3) * length * 0.04;
      ctx.beginPath();
      ctx.moveTo(start.x + perpendicularX * offset + (dx / length) * inset, start.y + perpendicularY * offset + (dy / length) * inset);
      ctx.lineTo(end.x + perpendicularX * offset - (dx / length) * inset, end.y + perpendicularY * offset - (dy / length) * inset);
      ctx.stroke();
    }
    return true;
  }
  if (stroke.preset === "effect-line") {
    for (let offset = -1; offset <= 1; offset += 1) {
      ctx.globalAlpha = stroke.opacity * (offset === 0 ? 1 : 0.35);
      drawPolyline(ctx, points.map((point, index) => ({ ...point, y: point.y + offset * (2 + (index % 3)) })));
    }
    return true;
  }
  return false;
}

function drawBrushPath(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number, points: RasterPoint[]): void {
  const preset = brushPreset(stroke.preset);
  if (!points.length) return;
  const size = Math.max(1, stroke.size * preset.sizeMultiplier);
  ctx.globalCompositeOperation = stroke.blendMode;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = size;
  ctx.globalAlpha = Math.min(1, Math.max(0, stroke.opacity * preset.opacity));

  if (drawMangaEffectStroke(ctx, stroke, width, height, points)) return;

  if (preset.engine === "eraser") {
    for (const point of points) drawSoftStamp(ctx, point, size, "#000000", stroke.opacity * preset.opacity, preset.hardness);
    return;
  }
  if (preset.engine === "airbrush" || preset.engine === "watercolor") {
    for (const point of points) drawSoftStamp(ctx, point, size, stroke.color, stroke.opacity * preset.opacity, preset.hardness);
    return;
  }
  if (preset.engine === "spray") {
    drawSpray(ctx, points, size, stroke.color, stroke.opacity * preset.opacity);
    return;
  }
  if (preset.engine === "pixel") {
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    drawPolyline(ctx, points.map((point) => ({ ...point, x: Math.round(point.x), y: Math.round(point.y) })));
    return;
  }
  if (preset.engine === "blend") {
    ctx.globalAlpha = Math.min(1, stroke.opacity * 0.5);
    ctx.globalCompositeOperation = "source-over";
    drawPolyline(ctx, points);
    return;
  }
  drawPolyline(ctx, points);
}

function drawBrushStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number): void {
  drawBrushPath(ctx, stroke, width, height, stroke.points);
  const axis = stroke.mirrorAxis;
  if (axis?.kind === "symmetry") {
    drawBrushPath(ctx, stroke, width, height, stroke.points.map((point) => mirrorPointAcrossRuler(point, axis)));
  }
}

function drawShape(ctx: CanvasRenderingContext2D, stroke: RasterStroke): void {
  const start = stroke.points[0];
  const end = stroke.points.at(-1);
  if (!start || !end) return;
  ctx.globalCompositeOperation = stroke.blendMode;
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.kind === "line") {
    drawPolyline(ctx, stroke.points);
    return;
  }
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (stroke.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, Math.max(1, width / 2), Math.max(1, height / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (stroke.kind === "polygon") {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const outerX = Math.max(1, width / 2);
    const outerY = Math.max(1, height / 2);
    const isStar = stroke.preset === "star";
    const vertices = isStar ? 10 : 6;
    ctx.beginPath();
    for (let index = 0; index < vertices; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / vertices;
      const inner = isStar && index % 2 === 1;
      const pointX = centerX + Math.cos(angle) * outerX * (inner ? 0.45 : 1);
      const pointY = centerY + Math.sin(angle) * outerY * (inner ? 0.45 : 1);
      if (index === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    }
    ctx.closePath();
    ctx.stroke();
    return;
  }
  if (stroke.preset === "rounded-rectangle") {
    const radius = Math.min(24, width / 4, height / 4);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();
    return;
  }
  ctx.strokeRect(x, y, width, height);
}

function drawTonePattern(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number): boolean {
  if (stroke.preset !== "manga-tone" && stroke.preset !== "screentone" && stroke.preset !== "gradient-tone") return false;
  const spacing = Math.max(5, Math.min(28, Math.round(stroke.size * 0.75)));
  ctx.globalCompositeOperation = stroke.blendMode;
  ctx.fillStyle = stroke.color;
  ctx.strokeStyle = stroke.color;
  ctx.globalAlpha = Math.min(1, stroke.opacity);
  if (stroke.preset === "manga-tone") {
    ctx.lineWidth = Math.max(1, spacing * 0.16);
    for (let offset = -height; offset < width + height; offset += spacing) {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset - height, height);
      ctx.stroke();
    }
    return true;
  }
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const gradientFactor = stroke.preset === "gradient-tone" ? Math.max(0.08, Math.min(1, y / Math.max(1, height))) : 0.46;
      const radius = Math.max(0.7, spacing * 0.34 * gradientFactor);
      ctx.beginPath();
      ctx.arc(x + (Math.floor(y / spacing) % 2 ? spacing / 2 : 0), y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return true;
}

function drawSpecialStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number): void {
  if (stroke.kind === "bucket" || stroke.kind === "erase-fill") {
    floodFill(ctx, stroke, width, height, stroke.kind === "erase-fill");
    return;
  }
  if (stroke.kind === "fill") {
    if (drawTonePattern(ctx, stroke, width, height)) return;
    ctx.globalCompositeOperation = stroke.blendMode;
    ctx.globalAlpha = stroke.opacity;
    ctx.fillStyle = stroke.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (stroke.kind === "gradient") {
    const start = stroke.points[0] ?? { x: 0, y: 0, pressure: 1 };
    const end = stroke.points.at(-1) ?? { x: width, y: height, pressure: 1 };
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, stroke.color);
    gradient.addColorStop(1, `${stroke.color}00`);
    ctx.globalCompositeOperation = stroke.blendMode;
    ctx.globalAlpha = stroke.opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number): void {
  if (stroke.kind === "content-fill") {
    if (!stroke.selection) return;
    const image = ctx.getImageData(0, 0, width, height);
    contentAwareFillPixels(image.data, width, height, stroke.selection, stroke.opacity, stroke.preserveAlpha);
    ctx.putImageData(image, 0, 0);
    return;
  }
  if (stroke.kind === "filter") {
    if (!isLocalRetouchPreset(stroke.preset)) return;
    const image = ctx.getImageData(0, 0, width, height);
    applyRetouchPixels(image.data, width, height, {
      preset: stroke.preset,
      points: stroke.points,
      size: stroke.size,
      opacity: stroke.opacity,
      selection: stroke.selection,
    });
    ctx.putImageData(image, 0, 0);
    return;
  }
  if (stroke.kind === "bucket" || stroke.kind === "erase-fill") {
    drawSpecialStroke(ctx, stroke, width, height);
    return;
  }
  withSelection(ctx, stroke.selection, () => {
    if (stroke.kind === "fill" || stroke.kind === "gradient") drawSpecialStroke(ctx, stroke, width, height);
    else if (stroke.kind === "stroke") drawBrushStroke(ctx, stroke, width, height);
    else drawShape(ctx, stroke);
  });
}

function initializeCanvas(canvas: HTMLCanvasElement, page: MangaPage): CanvasRenderingContext2D | null {
  const width = Math.max(1, Math.round(page.width));
  const height = Math.max(1, Math.round(page.height));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, width, height);
  return ctx;
}

function drawAlphaLockedStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number): void {
  if (!stroke.preserveAlpha || stroke.blendMode === "destination-out" || stroke.kind === "filter" || stroke.kind === "content-fill") {
    drawStroke(ctx, stroke, width, height);
    return;
  }
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) return;
  drawStroke(scratchCtx, stroke, width, height);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function applyLayerMask(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, layer: RasterLayer): void {
  const mask = layer.mask;
  if (!mask?.enabled) return;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) return;
  if (mask.inverted) {
    maskContext.fillStyle = "#000000";
    maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskContext.globalCompositeOperation = "destination-out";
  } else {
    maskContext.fillStyle = "#000000";
  }
  selectionPath(maskContext, mask.selection);
  maskContext.fill();
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}

export function renderRasterLayer(canvas: HTMLCanvasElement, page: MangaPage, layer: RasterLayer, preview?: RasterStroke | null): void {
  const issue = rasterDimensionError(page.width, page.height);
  if (issue) throw new Error(issue);
  const ctx = initializeCanvas(canvas, page);
  if (!ctx || layer.hidden) return;
  for (const stroke of layer.strokes) drawAlphaLockedStroke(ctx, stroke, canvas.width, canvas.height);
  if (preview) drawAlphaLockedStroke(ctx, preview, canvas.width, canvas.height);
  applyLayerMask(canvas, ctx, layer);
}

export function renderRasterLayers(canvas: HTMLCanvasElement, page: MangaPage, preview?: RasterStroke | null): void {
  const issue = rasterDimensionError(page.width, page.height);
  if (issue) throw new Error(issue);
  const ctx = initializeCanvas(canvas, page);
  if (!ctx) return;
  const layers = orderedPageLayers(page).filter(isRasterLayer);
  for (const [index, layer] of layers.entries()) {
    if (layer.hidden) continue;
    const scratch = document.createElement("canvas");
    renderRasterLayer(scratch, page, layer, index === layers.length - 1 ? preview : null);
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }
}

export function rasterCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
