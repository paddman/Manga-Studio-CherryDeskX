import type { MangaElement, MangaPage, RasterLayer } from "../types";

export type PageLayer = MangaElement | RasterLayer;

export function isRasterLayer(layer: PageLayer): layer is RasterLayer {
  return layer.kind === "raster";
}

export function pageLayerIds(page: MangaPage): string[] {
  return [...page.elements.map((element) => element.id), ...page.rasterLayers.map((layer) => layer.id)];
}

function completePageLayerOrder(page: MangaPage): string[] {
  const ids = pageLayerIds(page);
  const available = new Set(ids);
  return [...new Set([...page.layerOrder, ...ids])].filter((id) => available.has(id));
}

export function normalizePageLayerOrder(page: MangaPage): string[] {
  page.layerOrder = completePageLayerOrder(page);
  return page.layerOrder;
}

export function orderedPageLayers(page: MangaPage): PageLayer[] {
  const layers: PageLayer[] = [...page.elements, ...page.rasterLayers];
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const order = completePageLayerOrder(page);
  const ordered = order
    .map((id) => byId.get(id))
    .filter((layer): layer is PageLayer => layer !== undefined);
  return [...ordered, ...layers.filter((layer) => !order.includes(layer.id))];
}

export function movePageLayer(page: MangaPage, layerId: string, direction: -1 | 1): boolean {
  const order = normalizePageLayerOrder(page);
  const index = order.indexOf(layerId);
  if (index < 0) return false;
  const nextIndex = Math.min(order.length - 1, Math.max(0, index + direction));
  if (nextIndex === index) return false;
  [order[index], order[nextIndex]] = [order[nextIndex]!, order[index]!];
  return true;
}

export function removeFromPageLayerOrder(page: MangaPage, layerIds: ReadonlySet<string>): void {
  page.layerOrder = page.layerOrder.filter((id) => !layerIds.has(id));
}
