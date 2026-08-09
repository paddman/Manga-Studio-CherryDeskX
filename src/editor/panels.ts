import { uid } from "../sample";
import type { MangaPage, PanelElement } from "../types";
import { normalizePageLayerOrder } from "./layers";
import { activePage, runtime, selectedElement, setSelection, transact } from "./state";

export type PanelSplitAxis = "horizontal" | "vertical";

export interface PanelSplitResult {
  first: PanelElement;
  second: PanelElement;
}

export function splitPanelModel(
  page: MangaPage,
  panelId: string,
  axis: PanelSplitAxis,
  ratio: number,
  gutter: number,
): PanelSplitResult | null {
  const index = page.elements.findIndex((element) => element.id === panelId && element.kind === "panel");
  const panel = page.elements[index];
  if (!panel || panel.kind !== "panel") return null;
  const boundedRatio = Math.max(0.15, Math.min(0.85, ratio));
  const availableSize = axis === "vertical" ? panel.width : panel.height;
  const safeGutter = Math.max(0, Math.min(gutter, availableSize * 0.25));
  const firstSize = Math.max(24, availableSize * boundedRatio - safeGutter / 2);
  const secondStart = availableSize * boundedRatio + safeGutter / 2;
  const secondSize = Math.max(24, availableSize - secondStart);
  const first: PanelElement = {
    ...structuredClone(panel),
    id: uid("panel"),
    name: `${panel.name} A`,
    width: axis === "vertical" ? firstSize : panel.width,
    height: axis === "horizontal" ? firstSize : panel.height,
  };
  const second: PanelElement = {
    ...structuredClone(panel),
    id: uid("panel"),
    name: `${panel.name} B`,
    x: panel.x + (axis === "vertical" ? secondStart : 0),
    y: panel.y + (axis === "horizontal" ? secondStart : 0),
    width: axis === "vertical" ? secondSize : panel.width,
    height: axis === "horizontal" ? secondSize : panel.height,
  };

  const children = page.elements.filter((element) => element.parentId === panel.id);
  for (const child of children) {
    const pageX = panel.x + child.x;
    const pageY = panel.y + child.y;
    const childCenter = axis === "vertical" ? pageX + child.width / 2 : pageY + child.height / 2;
    const splitAt = axis === "vertical" ? second.x : second.y;
    const parent = childCenter < splitAt ? first : second;
    child.parentId = parent.id;
    child.x = pageX - parent.x;
    child.y = pageY - parent.y;
  }

  const order = [...normalizePageLayerOrder(page)];
  const orderIndex = order.indexOf(panel.id);
  page.elements.splice(index, 1, first, second);
  page.layerOrder = order.filter((id) => id !== panel.id && id !== first.id && id !== second.id);
  page.layerOrder.splice(Math.max(0, orderIndex), 0, first.id, second.id);
  page.thumbnailVersion += 1;
  return { first, second };
}

export function splitPanelAtPoint(point: { x: number; y: number }, centered = false, alternateAxis = false): PanelSplitResult | null {
  const page = activePage();
  const selected = selectedElement();
  const panel = selected?.kind === "panel"
    ? selected
    : [...page.elements].reverse().find((element): element is PanelElement => element.kind === "panel"
        && point.x >= element.x
        && point.x <= element.x + element.width
        && point.y >= element.y
        && point.y <= element.y + element.height);
  if (!panel) return null;
  let axis: PanelSplitAxis = panel.width >= panel.height ? "vertical" : "horizontal";
  if (alternateAxis) axis = axis === "vertical" ? "horizontal" : "vertical";
  const ratio = centered
    ? 0.5
    : axis === "vertical"
      ? (point.x - panel.x) / Math.max(1, panel.width)
      : (point.y - panel.y) / Math.max(1, panel.height);
  let result: PanelSplitResult | null = null;
  transact(() => {
    result = splitPanelModel(page, panel.id, axis, ratio, runtime.project.gutter);
    if (result) setSelection([result.first.id, result.second.id]);
  });
  return result;
}
