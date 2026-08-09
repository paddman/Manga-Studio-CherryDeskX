import { uid } from "../sample";
import type { PixelSelectionShape, RasterLayer, RasterStroke } from "../types";
import { activePage, runtime, transact } from "./state";
import { rasterCanvasBlob, rasterDimensionError } from "./raster";
import { normalizePageLayerOrder } from "./layers";

export function activeRasterLayer(): RasterLayer | null {
  const page = activePage();
  const preferred = runtime.preferences.activeRasterLayerId;
  const layer = page.rasterLayers.find((candidate) => candidate.id === preferred && !candidate.hidden && !candidate.locked);
  return layer ?? page.rasterLayers.find((candidate) => !candidate.hidden && !candidate.locked) ?? null;
}

export function addRasterLayer(name = "Raster Layer"): RasterLayer {
  const page = activePage();
  const issue = rasterDimensionError(page.width, page.height);
  if (issue) throw new Error(issue);
  const layer: RasterLayer = {
    id: uid("raster"),
    kind: "raster",
    name,
    width: page.width,
    height: page.height,
    opacity: 1,
    hidden: false,
    locked: false,
    alphaLock: false,
    blendMode: "source-over",
    strokes: [],
  };
  transact(() => {
    page.rasterLayers.push(layer);
    normalizePageLayerOrder(page);
    runtime.preferences.activeRasterLayerId = layer.id;
  });
  return layer;
}

export function ensureRasterLayer(): RasterLayer {
  return activeRasterLayer() ?? addRasterLayer();
}

export function selectRasterLayer(layerId: string): boolean {
  const layer = activePage().rasterLayers.find((candidate) => candidate.id === layerId);
  if (!layer) return false;
  runtime.preferences.activeRasterLayerId = layerId;
  runtime.selectedId = layerId;
  runtime.selectedIds = [layerId];
  return true;
}

export function recordRasterStroke(stroke: RasterStroke): boolean {
  const layer = ensureRasterLayer();
  if (layer.locked || layer.hidden) return false;
  transact(() => {
    layer.strokes.push({ ...structuredClone(stroke), preserveAlpha: layer.alphaLock && stroke.blendMode !== "destination-out" });
    runtime.selectedId = layer.id;
    runtime.selectedIds = [layer.id];
    runtime.preferences.activeRasterLayerId = layer.id;
    activePage().thumbnailVersion += 1;
  });
  return true;
}

export function clearRasterLayer(): boolean {
  const layer = activeRasterLayer();
  if (!layer || !layer.strokes.length) return false;
  transact(() => {
    layer.strokes = [];
    activePage().thumbnailVersion += 1;
  });
  return true;
}

export function splitLastStrokeToLayer(): RasterLayer | null {
  const source = activeRasterLayer();
  if (!source || !source.strokes.length) return null;
  const page = activePage();
  const stroke = source.strokes.at(-1);
  if (!stroke) return null;
  const layer: RasterLayer = {
    id: uid("raster"),
    kind: "raster",
    name: `${source.name} • แยก Stroke`,
    width: page.width,
    height: page.height,
    opacity: source.opacity,
    hidden: false,
    locked: false,
    alphaLock: false,
    blendMode: source.blendMode,
    strokes: [structuredClone(stroke)],
  };
  transact(() => {
    source.strokes.pop();
    const sourceIndex = page.rasterLayers.findIndex((candidate) => candidate.id === source.id);
    page.rasterLayers.splice(sourceIndex + 1, 0, layer);
    const order = normalizePageLayerOrder(page);
    const orderIndex = order.indexOf(source.id);
    page.layerOrder = order.filter((id) => id !== layer.id);
    page.layerOrder.splice(orderIndex + 1, 0, layer.id);
    runtime.preferences.activeRasterLayerId = layer.id;
    runtime.selectedId = layer.id;
    runtime.selectedIds = [layer.id];
    page.thumbnailVersion += 1;
  });
  return layer;
}

export function setPixelSelection(selection: PixelSelectionShape | null): void {
  runtime.pixelSelection = selection ? structuredClone(selection) : null;
}

export function clearPixelSelection(): void {
  runtime.pixelSelection = null;
}

export function applyPixelSelectionAsLayerMask(): boolean {
  const layer = activeRasterLayer();
  if (!layer || !runtime.pixelSelection) return false;
  transact(() => {
    layer.mask = { enabled: true, inverted: false, selection: structuredClone(runtime.pixelSelection!) };
    activePage().thumbnailVersion += 1;
  });
  return true;
}

export function removeRasterLayerMask(): boolean {
  const layer = activeRasterLayer();
  if (!layer?.mask) return false;
  transact(() => {
    layer.mask = undefined;
    activePage().thumbnailVersion += 1;
  });
  return true;
}

export function invertRasterLayerMask(): boolean {
  const layer = activeRasterLayer();
  if (!layer?.mask) return false;
  transact(() => {
    if (layer.mask) layer.mask.inverted = !layer.mask.inverted;
    activePage().thumbnailVersion += 1;
  });
  return true;
}

export async function persistRasterCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const layer = activeRasterLayer();
  if (!layer || !runtime.persistenceReady) return;
  const blob = await rasterCanvasBlob(canvas);
  if (!blob) return;
  const bitmapKey = layer.bitmapKey ?? `${runtime.project.id}/${activePage().id}/${layer.id}`;
  await runtime.persistence.rasters.put(bitmapKey, blob);
  layer.bitmapKey = bitmapKey;
}
