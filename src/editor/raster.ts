import { brushPreset } from "./tools";
import type { MangaPage, PixelSelectionShape, RasterLayer, RasterPoint, RasterStroke } from "../types";

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

function drawBrushStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke): void {
  const preset = brushPreset(stroke.preset);
  const points = stroke.points;
  if (!points.length) return;
  const size = Math.max(1, stroke.size * preset.sizeMultiplier);
  ctx.globalCompositeOperation = stroke.blendMode;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = size;
  ctx.globalAlpha = Math.min(1, Math.max(0, stroke.opacity * preset.opacity));

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
    drawPolyline(ctx, stroke.points);
    return;
  }
  ctx.strokeRect(x, y, width, height);
}

function drawSpecialStroke(ctx: CanvasRenderingContext2D, stroke: RasterStroke, width: number, height: number): void {
  if (stroke.kind === "fill") {
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
  withSelection(ctx, stroke.selection, () => {
    if (stroke.kind === "fill" || stroke.kind === "gradient") drawSpecialStroke(ctx, stroke, width, height);
    else if (stroke.kind === "stroke") drawBrushStroke(ctx, stroke);
    else drawShape(ctx, stroke);
  });
}

function orderedRasterLayers(page: MangaPage): RasterLayer[] {
  const byId = new Map(page.rasterLayers.map((layer) => [layer.id, layer]));
  const ordered = page.layerOrder.map((id) => byId.get(id)).filter((layer): layer is RasterLayer => layer !== undefined);
  return [...ordered, ...page.rasterLayers.filter((layer) => !page.layerOrder.includes(layer.id))];
}

export function renderRasterLayers(canvas: HTMLCanvasElement, page: MangaPage, preview?: RasterStroke | null): void {
  const width = Math.max(1, Math.round(page.width));
  const height = Math.max(1, Math.round(page.height));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  for (const layer of orderedRasterLayers(page)) {
    if (layer.hidden) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    for (const stroke of layer.strokes) drawStroke(ctx, stroke, width, height);
    ctx.restore();
  }
  if (preview) {
    ctx.save();
    drawStroke(ctx, preview, width, height);
    ctx.restore();
  }
}

export function rasterCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
