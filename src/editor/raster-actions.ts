import { uid } from "../sample";
import type { PixelSelectionShape, RasterLayer, RasterStroke } from "../types";
import { activePage, runtime, transact } from "./state";
import { rasterCanvasBlob } from "./raster";

function normalizeLayerOrder(): void {
  const page = activePage();
  const ids = [...page.elements.map((element) => element.id), ...page.rasterLayers.map((layer) => layer.id)];
  page.layerOrder = [...new Set([...page.layerOrder, ...ids])].filter((id) => ids.includes(id));
}

export function activeRasterLayer(): RasterLayer | null {
  const page = activePage();
  const preferred = runtime.preferences.activeRasterLayerId;
  const layer = page.rasterLayers.find((candidate) => candidate.id === preferred && !candidate.hidden && !candidate.locked);
  return layer ?? page.rasterLayers.find((candidate) => !candidate.hidden && !candidate.locked) ?? null;
}

export function addRasterLayer(name = "Raster Layer"): RasterLayer {
  const page = activePage();
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
    normalizeLayerOrder();
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
    layer.strokes.push(structuredClone(stroke));
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

export function setPixelSelection(selection: PixelSelectionShape | null): void {
  runtime.pixelSelection = selection ? structuredClone(selection) : null;
}

export function clearPixelSelection(): void {
  runtime.pixelSelection = null;
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
