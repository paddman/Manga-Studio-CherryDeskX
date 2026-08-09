import "./styles.css";
import { downloadBlobFile, exportProject, type ExportFormat } from "./export";
import { exportProjectBundle, importProjectBundle } from "./persistence/archive";
import { hydrateAssetSources } from "./persistence/serialization";
import { renderRasterLayer } from "./editor/raster";
import { addRasterLayer, applyPixelSelectionAsLayerMask, clearPixelSelection, clearRasterLayer, ensureRasterLayer, invertRasterLayerMask, persistRasterCanvas, recordRasterStroke, removeRasterLayerMask, selectRasterLayer, splitLastStrokeToLayer } from "./editor/raster-actions";
import { buildPixelSelection, clientToPagePoint, isEraserToolId, isUsablePixelSelection, rasterStrokeKindForToolId, selectionModeForToolId } from "./editor/interactions";
import { canUseTool, getToolDefinition, isRasterTool, resolveToolShortcut, toolId } from "./editor/tools";
import {
  addAssetToPage,
  addBubble,
  addPage,
  addPanel,
  addTextElement,
  addChapter,
  addVolume,
  applyPanelTemplate,
  alignSelected,
  clamp,
  copySelected,
  cutSelected,
  deletePage,
  deleteActiveChapter,
  deleteActiveVolume,
  deleteSelected,
  detachSelectedImage,
  distributeSelected,
  duplicatePage,
  duplicateSelected,
  flipSelected,
  getCropRect,
  groupSelected,
  handleUploads,
  moveLayer,
  moveActivePage,
  pasteElements,
  removeOrphanAssets,
  resetImageEdits,
  setPageProperty,
  setProjectProperty,
  setCropValue,
  setCropRect,
  setHierarchyName,
  setSelectedProperty,
  smartLayout,
  toggleSelectedLock,
  ungroupSelected,
} from "./editor/actions";
import {
  activePage,
  checkpoint,
  initializePersistence,
  persistProject,
  redoProject,
  runtime,
  savePreferences,
  selectedElement,
  selectedElements,
  setSelection,
  transact,
  undoProject,
} from "./editor/state";
import { renderApp } from "./editor/view";
import type { BubbleVariant, ImageElement, LeftTab, MangaElement, PixelSelectionShape, RasterPoint, RasterStroke, TextAlign, Tool } from "./types";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");
const appRoot: HTMLDivElement = root;
let toastTimer: number | undefined;

function render(): void {
  appRoot.innerHTML = renderApp();
  const page = activePage();
  document.querySelectorAll<HTMLCanvasElement>("[data-raster-layer-id]").forEach((canvas) => {
    const layer = page.rasterLayers.find((candidate) => candidate.id === canvas.dataset.rasterLayerId);
    if (!layer) return;
    const preview = runtime.preferences.activeRasterLayerId === layer.id ? runtime.rasterPreview : null;
    renderRasterLayer(canvas, page, layer, preview);
  });
}

function activeRasterCanvas(): HTMLCanvasElement | null {
  const layerId = runtime.preferences.activeRasterLayerId;
  if (!layerId) return null;
  return document.querySelector<HTMLCanvasElement>(`[data-raster-layer-id="${CSS.escape(layerId)}"]`);
}

function showToast(message: string, tone: "default" | "success" | "danger" = "default"): void {
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast is-visible tone-${tone}`;
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function rerender(message?: string, tone: "default" | "success" | "danger" = "success"): void {
  render();
  if (runtime.storageError) showToast(runtime.storageError, "danger");
  else if (message) showToast(message, tone);
}

function updateSelectionDom(id: string): HTMLElement | null {
  document.querySelectorAll(".canvas-element.is-selected").forEach((node) => node.classList.remove("is-selected"));
  document.querySelectorAll(".layer-row.is-active").forEach((node) => node.classList.remove("is-active"));
  const ids = runtime.selectedIds.length ? runtime.selectedIds : [id];
  ids.forEach((selectedId) => {
    document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(selectedId)}"]`)?.classList.add("is-selected");
    document.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(selectedId)}"]`)?.classList.add("is-active");
  });
  const node = document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`);
  return node;
}

interface DragItem {
  element: MangaElement;
  node: HTMLElement;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

interface DragContext {
  items: DragItem[];
  startClientX: number;
  startClientY: number;
}

function capturePointer(event: PointerEvent): () => void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return () => undefined;
  try {
    target.setPointerCapture(event.pointerId);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    } catch {
      // A rerender can detach the original pointer target before pointerup.
    }
  };
}

function pagePosition(element: MangaElement): { x: number; y: number } {
  if (!element.parentId) return { x: element.x, y: element.y };
  const parent = activePage().elements.find((candidate) => candidate.id === element.parentId);
  return parent ? { x: parent.x + element.x, y: parent.y + element.y } : { x: element.x, y: element.y };
}

function moveByPageDelta(element: MangaElement, dx: number, dy: number): void {
  if (element.parentId) {
    element.x += dx;
    element.y += dy;
  } else {
    element.x += dx;
    element.y += dy;
  }
}

function snapDraggedItems(items: DragItem[]): void {
  const page = activePage();
  const selectedIds = new Set(items.map((item) => item.element.id));
  const boxes = items.map(({ element }) => {
    const position = pagePosition(element);
    return { element, ...position, right: position.x + element.width, bottom: position.y + element.height };
  });
  const minX = Math.min(...boxes.map((box) => box.x));
  const maxX = Math.max(...boxes.map((box) => box.right));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxY = Math.max(...boxes.map((box) => box.bottom));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const xCandidates = [0, page.width / 2, page.width, ...page.elements.filter((element) => !selectedIds.has(element.id)).flatMap((element) => {
    const position = pagePosition(element);
    return [position.x, position.x + element.width / 2, position.x + element.width];
  })];
  const yCandidates = [0, page.height / 2, page.height, ...page.elements.filter((element) => !selectedIds.has(element.id)).flatMap((element) => {
    const position = pagePosition(element);
    return [position.y, position.y + element.height / 2, position.y + element.height];
  })];
  const xTargets = [{ value: minX, offset: 0 }, { value: centerX, offset: 0 }, { value: maxX, offset: 0 }];
  const yTargets = [{ value: minY, offset: 0 }, { value: centerY, offset: 0 }, { value: maxY, offset: 0 }];
  const nearest = (targets: { value: number; offset: number }[], candidates: number): { correction: number; position: number } | null => {
    let best: { correction: number; position: number } | null = null;
    for (const target of targets) {
      const correction = candidates - target.value;
      if (Math.abs(correction) > 8 || (best && Math.abs(correction) >= Math.abs(best.correction))) continue;
      best = { correction, position: candidates };
    }
    return best;
  };
  const xSnap = xCandidates.map((candidate) => nearest(xTargets, candidate)).filter((value): value is { correction: number; position: number } => value !== null).sort((a, b) => Math.abs(a.correction) - Math.abs(b.correction))[0];
  const ySnap = yCandidates.map((candidate) => nearest(yTargets, candidate)).filter((value): value is { correction: number; position: number } => value !== null).sort((a, b) => Math.abs(a.correction) - Math.abs(b.correction))[0];
  runtime.selectionGuides = [];
  if (xSnap) {
    boxes.forEach(({ element }) => moveByPageDelta(element, xSnap.correction, 0));
    runtime.selectionGuides.push({ axis: "x", position: xSnap.position, label: `${Math.round(xSnap.position)} px` });
  }
  if (ySnap) {
    boxes.forEach(({ element }) => moveByPageDelta(element, 0, ySnap.correction));
    runtime.selectionGuides.push({ axis: "y", position: ySnap.position, label: `${Math.round(ySnap.position)} px` });
  }
}

function beginMove(event: PointerEvent, element: MangaElement, node: HTMLElement): void {
  if (element.locked || runtime.preferences.tool !== "select") return;
  if (runtime.preferences.cropElementId === element.id && element.kind === "image") {
    beginCropMove(event, element, node);
    return;
  }
  const elements = selectedElements().filter((candidate) => !candidate.locked);
  const releasePointer = capturePointer(event);
  checkpoint();
  const context: DragContext = {
    items: elements.map((candidate) => ({
      element: candidate,
      node: document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(candidate.id)}"]`) ?? node,
      startX: candidate.x,
      startY: candidate.y,
      startWidth: candidate.width,
      startHeight: candidate.height,
    })),
    startClientX: event.clientX,
    startClientY: event.clientY,
  };

  const move = (moveEvent: PointerEvent): void => {
    const dx = (moveEvent.clientX - context.startClientX) / runtime.preferences.zoom;
    const dy = (moveEvent.clientY - context.startClientY) / runtime.preferences.zoom;
    const page = activePage();
    context.items.forEach((item) => {
      const parent = item.element.parentId ? page.elements.find((candidate) => candidate.id === item.element.parentId) : null;
      const minX = parent ? 0 : -item.element.width + 24;
      const maxX = parent && parent.kind === "panel" ? parent.width - 24 : page.width - 24;
      const minY = parent ? 0 : -item.element.height + 24;
      const maxY = parent && parent.kind === "panel" ? parent.height - 24 : page.height - 24;
      item.element.x = clamp(item.startX + dx, minX, maxX);
      item.element.y = clamp(item.startY + dy, minY, maxY);
      item.node.style.left = `${item.element.x}px`;
      item.node.style.top = `${item.element.y}px`;
    });
    snapDraggedItems(context.items);
    context.items.forEach((item) => {
      item.node.style.left = `${item.element.x}px`;
      item.node.style.top = `${item.element.y}px`;
    });
  };

  const end = (): void => {
    window.removeEventListener("pointermove", move);
    releasePointer();
    for (const item of context.items) {
      if (item.element.kind !== "image" || item.element.parentId) continue;
      const position = pagePosition(item.element);
      const centerX = position.x + item.element.width / 2;
      const centerY = position.y + item.element.height / 2;
      const panel = activePage().elements.find((candidate) => candidate.kind === "panel" && centerX >= candidate.x && centerX <= candidate.x + candidate.width && centerY >= candidate.y && centerY <= candidate.y + candidate.height);
      if (panel?.kind === "panel") {
        item.element.parentId = panel.id;
        item.element.x = position.x - panel.x;
        item.element.y = position.y - panel.y;
        panel.clipChildren = true;
      }
    }
    runtime.selectionGuides = [];
    persistProject();
    rerender();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginCropMove(event: PointerEvent, element: ImageElement, node: HTMLElement): void {
  const releasePointer = capturePointer(event);
  checkpoint();
  const start = getCropRect(element);
  const nodeRect = node.getBoundingClientRect();
  const move = (moveEvent: PointerEvent): void => {
    const dx = (moveEvent.clientX - event.clientX) / Math.max(1, nodeRect.width);
    const dy = (moveEvent.clientY - event.clientY) / Math.max(1, nodeRect.height);
    setCropRect(element, { ...start, left: start.left + dx, top: start.top + dy });
  };
  const end = (): void => {
    window.removeEventListener("pointermove", move);
    releasePointer();
    persistProject();
    rerender("ปรับ Crop แล้ว");
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginCropResize(event: PointerEvent, element: ImageElement, node: HTMLElement, handle: string): void {
  const releasePointer = capturePointer(event);
  checkpoint();
  const start = getCropRect(element);
  const nodeRect = node.getBoundingClientRect();
  const startRight = start.left + start.width;
  const startBottom = start.top + start.height;
  const move = (moveEvent: PointerEvent): void => {
    const dx = (moveEvent.clientX - event.clientX) / Math.max(1, nodeRect.width);
    const dy = (moveEvent.clientY - event.clientY) / Math.max(1, nodeRect.height);
    let left = start.left;
    let top = start.top;
    let right = startRight;
    let bottom = startBottom;
    if (handle.includes("w")) left = clamp(start.left + dx, 0, startRight - 0.05);
    if (handle.includes("e")) right = clamp(startRight + dx, start.left + 0.05, 1);
    if (handle.includes("n")) top = clamp(start.top + dy, 0, startBottom - 0.05);
    if (handle.includes("s")) bottom = clamp(startBottom + dy, start.top + 0.05, 1);
    setCropRect(element, { left, top, width: right - left, height: bottom - top });
  };
  const end = (): void => {
    window.removeEventListener("pointermove", move);
    releasePointer();
    persistProject();
    rerender("เลือกพื้นที่ Crop แล้ว");
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginResize(event: PointerEvent, element: MangaElement, node: HTMLElement, handle: string): void {
  if (element.locked) return;
  const releasePointer = capturePointer(event);
  checkpoint();
  const context = {
    element,
    node,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: element.x,
    startY: element.y,
    startWidth: element.width,
    startHeight: element.height,
  };
  const ratio = context.startWidth / context.startHeight;

  const move = (moveEvent: PointerEvent): void => {
    const dx = (moveEvent.clientX - context.startClientX) / runtime.preferences.zoom;
    const dy = (moveEvent.clientY - context.startClientY) / runtime.preferences.zoom;
    let x = context.startX;
    let y = context.startY;
    let width = context.startWidth;
    let height = context.startHeight;

    if (handle.includes("e")) width = context.startWidth + dx;
    if (handle.includes("s")) height = context.startHeight + dy;
    if (handle.includes("w")) {
      width = context.startWidth - dx;
      x = context.startX + dx;
    }
    if (handle.includes("n")) {
      height = context.startHeight - dy;
      y = context.startY + dy;
    }

    if ((element.lockAspect || moveEvent.shiftKey) && handle.length === 2) {
      if (Math.abs(dx) > Math.abs(dy)) height = width / ratio;
      else width = height * ratio;
      if (handle.includes("w")) x = context.startX + context.startWidth - width;
      if (handle.includes("n")) y = context.startY + context.startHeight - height;
    }

    if (width < 20) {
      if (handle.includes("w")) x -= 20 - width;
      width = 20;
    }
    if (height < 20) {
      if (handle.includes("n")) y -= 20 - height;
      height = 20;
    }

    Object.assign(element, { x, y, width, height });
    Object.assign(node.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  };

  const end = (): void => {
    window.removeEventListener("pointermove", move);
    releasePointer();
    persistProject();
    rerender();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginRotate(event: PointerEvent, element: MangaElement, node: HTMLElement): void {
  if (element.locked) return;
  const releasePointer = capturePointer(event);
  checkpoint();
  const rect = node.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
  const startRotation = element.rotation;

  const move = (moveEvent: PointerEvent): void => {
    const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
    let degrees = startRotation + ((angle - startAngle) * 180) / Math.PI;
    if (moveEvent.shiftKey) degrees = Math.round(degrees / 15) * 15;
    element.rotation = degrees;
    node.style.transform = `rotate(${degrees}deg)`;
  };

  const end = (): void => {
    window.removeEventListener("pointermove", move);
    releasePointer();
    persistProject();
    rerender();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginPan(event: PointerEvent): void {
  const viewport = document.querySelector<HTMLElement>("[data-stage-viewport]");
  if (!viewport) return;
  const releasePointer = capturePointer(event);
  const startX = event.clientX;
  const startY = event.clientY;
  const scrollLeft = viewport.scrollLeft;
  const scrollTop = viewport.scrollTop;
  const move = (moveEvent: PointerEvent): void => {
    viewport.scrollLeft = scrollLeft - (moveEvent.clientX - startX);
    viewport.scrollTop = scrollTop - (moveEvent.clientY - startY);
  };
  const end = (): void => {
    window.removeEventListener("pointermove", move);
    releasePointer();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginSelectionRectangle(event: PointerEvent): void {
  const canvas = document.querySelector<HTMLElement>("[data-page-canvas]");
  if (!canvas) return;
  const releasePointer = capturePointer(event);
  const rect = canvas.getBoundingClientRect();
  const startX = clamp((event.clientX - rect.left) / runtime.preferences.zoom, 0, activePage().width);
  const startY = clamp((event.clientY - rect.top) / runtime.preferences.zoom, 0, activePage().height);
  runtime.selectionRectangle = { x: startX, y: startY, width: 0, height: 0 };
  render();
  const update = (moveEvent: PointerEvent): void => {
    const currentX = clamp((moveEvent.clientX - rect.left) / runtime.preferences.zoom, 0, activePage().width);
    const currentY = clamp((moveEvent.clientY - rect.top) / runtime.preferences.zoom, 0, activePage().height);
    runtime.selectionRectangle = {
      x: Math.min(startX, currentX),
      y: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
    };
    const node = document.querySelector<HTMLElement>(".selection-rectangle");
    if (node) {
      Object.assign(node.style, {
        left: `${runtime.selectionRectangle.x}px`,
        top: `${runtime.selectionRectangle.y}px`,
        width: `${runtime.selectionRectangle.width}px`,
        height: `${runtime.selectionRectangle.height}px`,
      });
    }
  };
  const end = (): void => {
    window.removeEventListener("pointermove", update);
    releasePointer();
    const selection = runtime.selectionRectangle;
    if (selection && (selection.width > 3 || selection.height > 3)) {
      const ids = activePage().elements.filter((element) => {
        const position = pagePosition(element);
        return position.x < selection.x + selection.width && position.x + element.width > selection.x && position.y < selection.y + selection.height && position.y + element.height > selection.y;
      }).map((element) => element.id);
      setSelection(ids);
    } else {
      setSelection([]);
    }
    runtime.selectionRectangle = null;
    render();
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", end, { once: true });
}

function pagePoint(event: PointerEvent): RasterPoint {
  const canvas = document.querySelector<HTMLElement>("[data-page-canvas]");
  const page = activePage();
  if (!canvas) return { x: 0, y: 0, pressure: event.pressure || 1 };
  return clientToPagePoint(event, canvas.getBoundingClientRect(), page);
}

function selectionModeForTool(tool: Tool): PixelSelectionShape["mode"] | null {
  return selectionModeForToolId(tool as string);
}

function beginPixelSelection(event: PointerEvent, mode: PixelSelectionShape["mode"]): void {
  const releasePointer = capturePointer(event);
  const start = pagePoint(event);
  const points: RasterPoint[] = [start];
  const update = (moveEvent: PointerEvent): void => {
    const current = pagePoint(moveEvent);
    if (mode === "lasso" || mode === "polygon") points.push(current);
    runtime.pixelSelection = buildPixelSelection(mode, mode === "lasso" || mode === "polygon" ? points : [start, current]);
    render();
  };
  const end = (): void => {
    window.removeEventListener("pointermove", update);
    releasePointer();
    const selection = runtime.pixelSelection;
    if (!isUsablePixelSelection(selection)) clearPixelSelection();
    render();
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", end, { once: true });
}

function beginRasterStroke(event: PointerEvent, tool: Tool): void {
  if (tool === toolId("lasso-fill") && !runtime.pixelSelection) {
    showToast("ใช้ Lasso หรือ Marquee เลือกพื้นที่ก่อนเติมสี", "danger");
    return;
  }
  let layer: ReturnType<typeof ensureRasterLayer>;
  try {
    layer = ensureRasterLayer();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "สร้าง Raster layer ไม่สำเร็จ", "danger");
    return;
  }
  if (layer.locked || layer.hidden) {
    showToast("เลเยอร์ Raster นี้ถูกล็อกหรือซ่อนอยู่", "danger");
    return;
  }
  const releasePointer = capturePointer(event);
  const kind = rasterStrokeKindForToolId(tool as string);
  const start = pagePoint(event);
  const stroke: RasterStroke = {
    id: `stroke_${Date.now()}_${Math.round(Math.random() * 100000)}`,
    kind,
    preset: tool as string,
    points: [start],
    color: runtime.preferences.brushColor,
    size: runtime.preferences.brushSize,
    opacity: runtime.preferences.brushOpacity,
    blendMode: isEraserToolId(tool as string) ? "destination-out" : "source-over",
    selection: runtime.pixelSelection ? structuredClone(runtime.pixelSelection) : undefined,
    preserveAlpha: layer.alphaLock,
    tolerance: 24,
  };
  if (!activeRasterCanvas()) render();
  if (kind === "fill" || kind === "bucket" || kind === "erase-fill") {
    recordRasterStroke(stroke);
    render();
    const canvas = activeRasterCanvas();
    if (canvas) void persistRasterCanvas(canvas);
    releasePointer();
    showToast("เติมสีบน Raster layer แล้ว", "success");
    return;
  }
  runtime.rasterPreview = stroke;
  const update = (moveEvent: PointerEvent): void => {
    stroke.points.push(pagePoint(moveEvent));
    const canvas = activeRasterCanvas();
    const activeLayer = activePage().rasterLayers.find((candidate) => candidate.id === runtime.preferences.activeRasterLayerId);
    if (canvas && activeLayer) renderRasterLayer(canvas, activePage(), activeLayer, runtime.rasterPreview);
  };
  const end = (): void => {
    window.removeEventListener("pointermove", update);
    releasePointer();
    if (stroke.points.length > 1 || kind !== "stroke") recordRasterStroke(stroke);
    runtime.rasterPreview = null;
    render();
    const canvas = activeRasterCanvas();
    if (canvas) void persistRasterCanvas(canvas);
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", end, { once: true });
}

function applyCanvasTool(event: PointerEvent, tool: Tool): boolean {
  const id = tool as string;
  if (id === "grid") {
    runtime.preferences.showGrid = !runtime.preferences.showGrid;
    savePreferences();
    render();
    return true;
  }
  if (id === "crop") {
    const image = selectedElement();
    if (image?.kind === "image") {
      runtime.preferences.cropElementId = image.id;
      savePreferences();
      render();
    } else showToast("เลือกภาพก่อนใช้ Crop Tool", "default");
    return true;
  }
  if (id === "text" || id === "horizontal-type" || id === "vertical-type" || id === "text-box") {
    addTextElement(false);
    const element = selectedElement();
    if (element?.kind === "text") {
      const point = pagePoint(event);
      transact(() => {
        element.x = point.x;
        element.y = point.y;
        element.writingMode = id === "vertical-type" ? "vertical" : "horizontal";
      });
    }
    render();
    return true;
  }
  if (id === "speech-balloon" || id === "thought-balloon" || id === "jagged-balloon") {
    const variant = id === "thought-balloon" ? "thought" : id === "jagged-balloon" ? "shout" : "speech";
    addBubble(variant);
    const element = selectedElement();
    if (element) {
      const point = pagePoint(event);
      transact(() => { element.x = point.x; element.y = point.y; });
    }
    render();
    return true;
  }
  if (id === "balloon-tail") {
    const element = selectedElement();
    if (element?.kind !== "bubble") {
      showToast("เลือกบอลลูนก่อนกำหนดตำแหน่งหาง", "default");
      return true;
    }
    const point = pagePoint(event);
    transact(() => {
      element.tailX = clamp(point.x - element.x, 0, element.width);
      element.tailY = clamp(point.y - element.y, 0, element.height * 1.6);
      element.tails = [{ id: element.tails[0]?.id ?? `tail_${Date.now()}`, x: element.tailX, y: element.tailY }];
    });
    render();
    return true;
  }
  if (id === "frame-border") {
    addPanel();
    const element = selectedElement();
    if (element) {
      const point = pagePoint(event);
      transact(() => { element.x = point.x; element.y = point.y; });
    }
    render();
    return true;
  }
  if (id === "flip") {
    flipSelected("horizontal");
    render();
    return true;
  }
  if (id === "rotate") {
    const elements = selectedElements();
    if (elements.length) {
      transact(() => elements.forEach((element) => { element.rotation += 15; }));
      render();
    }
    return true;
  }
  if (id === "eyedropper" || id === "color-picker" || id === "color-sampler") {
    const point = pagePoint(event);
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>("[data-raster-layer-id]")].reverse();
    const color = canvases.map((canvas) => canvas.getContext("2d")?.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data).find((sample) => (sample?.[3] ?? 0) > 0);
    if (color && (color[3] ?? 0) > 0) {
      runtime.preferences.brushColor = `#${[color[0] ?? 0, color[1] ?? 0, color[2] ?? 0].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
      savePreferences();
      showToast(`เลือกสี ${runtime.preferences.brushColor} แล้ว`, "success");
    }
    return true;
  }
  return false;
}

async function exportCurrentPage(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("[data-action='export']");
  if (button) {
    button.disabled = true;
    button.textContent = "กำลังส่งออก…";
  }
  try {
    const select = document.querySelector<HTMLSelectElement>("[data-export-format]");
    const format = (select?.value ?? "png") as ExportFormat;
    const scope = format === "zip" ? "project" : format === "pdf" || format === "cbz" || format === "webtoon" ? "chapter" : "page";
    const backgroundColor = format === "png" && runtime.preferences.exportTransparent
      ? null
      : format === "jpg" || format === "pdf" || format === "cbz"
        ? runtime.preferences.exportBackgroundColor
        : undefined;
    await exportProject(runtime.project, runtime.project.name, { format, scope, scale: 2, backgroundColor });
    showToast(`ส่งออก ${format.toUpperCase()} แล้ว`, "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "ส่งออกไม่สำเร็จ", "danger");
  } finally {
    render();
  }
}

async function exportProjectFile(): Promise<void> {
  try {
    const blob = await exportProjectBundle(runtime.project, runtime.persistence.assets, runtime.persistence.rasters);
    downloadBlobFile(blob, `${runtime.project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "manga-project"}.cherrymanga`);
    showToast("ส่งออกไฟล์ .cherrymanga แล้ว", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "ส่งออกโปรเจกต์ไม่สำเร็จ", "danger");
  }
}

function importProjectFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".cherrymanga,application/octet-stream,application/zip";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void importProjectBundle(file).then(async (bundle) => {
      runtime.project = bundle.project;
      runtime.assetSources.clear();
      await Promise.all([...bundle.assets.entries()].map(async ([assetId, blob]) => {
        await runtime.persistence.assets.put(assetId, blob);
        runtime.assetSources.set(assetId, URL.createObjectURL(blob));
      }));
      await Promise.all([...bundle.rasters.entries()].map(async ([bitmapKey, blob]) => runtime.persistence.rasters.put(bitmapKey, blob)));
      hydrateAssetSources(runtime.project, runtime.assetSources);
      setSelection([]);
      persistProject();
      render();
      showToast("นำเข้าโปรเจกต์แล้ว", "success");
    }).catch((error: unknown) => showToast(error instanceof Error ? error.message : "นำเข้าโปรเจกต์ไม่สำเร็จ", "danger"));
  };
  input.click();
}

function runMutation(action: () => void, message: string): void {
  action();
  rerender(message);
}

async function handleAction(action: string): Promise<void> {
  if (action === "undo") {
    if (undoProject()) rerender("ย้อนกลับแล้ว", "default");
    return;
  }
  if (action === "redo") {
    if (redoProject()) rerender("ทำซ้ำแล้ว", "default");
    return;
  }
  if (action === "save") {
    persistProject();
    rerender("บันทึกโปรเจกต์แล้ว");
    return;
  }
  if (action === "toggle-grid" || action === "toggle-safe" || action === "preview") {
    if (action === "toggle-grid") runtime.preferences.showGrid = !runtime.preferences.showGrid;
    if (action === "toggle-safe") runtime.preferences.showSafeArea = !runtime.preferences.showSafeArea;
    if (action === "preview") {
      runtime.preferences.preview = !runtime.preferences.preview;
      runtime.selectedId = null;
    }
    savePreferences();
    render();
    return;
  }
  if (action === "zoom-in" || action === "zoom-out") {
    const delta = action === "zoom-in" ? 0.08 : -0.08;
    runtime.preferences.zoom = clamp(Number((runtime.preferences.zoom + delta).toFixed(2)), 0.25, 1.5);
    savePreferences();
    render();
    return;
  }
  if (action === "export") return exportCurrentPage();
  if (action === "export-project") return exportProjectFile();
  if (action === "import-project") {
    importProjectFile();
    return;
  }
  if (action === "open-upload") {
    document.querySelector<HTMLInputElement>("[data-upload-input]")?.click();
    return;
  }
  if (action === "add-raster-layer") {
    try {
      addRasterLayer(`Raster ${activePage().rasterLayers.length + 1}`);
      runtime.preferences.leftTab = "assets";
      savePreferences();
      rerender("เพิ่ม Raster layer แล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "เพิ่ม Raster layer ไม่สำเร็จ", "danger");
    }
    return;
  }
  if (action === "clear-raster-layer") {
    if (clearRasterLayer()) rerender("ล้าง Raster layer แล้ว");
    else showToast("ยังไม่มี stroke ให้ล้าง", "default");
    return;
  }
  if (action === "split-raster-stroke") {
    if (splitLastStrokeToLayer()) rerender("แยก Stroke ล่าสุดเป็น Raster layer ใหม่แล้ว");
    return;
  }
  if (action === "apply-raster-mask") {
    if (applyPixelSelectionAsLayerMask()) rerender("สร้าง Mask จาก Selection แล้ว");
    return;
  }
  if (action === "invert-raster-mask") {
    if (invertRasterLayerMask()) rerender("กลับด้าน Mask แล้ว");
    return;
  }
  if (action === "remove-raster-mask") {
    if (removeRasterLayerMask()) rerender("ลบ Mask แล้ว");
    return;
  }
  if (action === "reset-image-edits") return runMutation(resetImageEdits, "รีเซ็ตการแต่งรูปแล้ว");
  if (action === "add-panel") return runMutation(addPanel, "เพิ่มช่องใหม่แล้ว");
  if (action === "add-text") return runMutation(() => addTextElement(false), "เพิ่มข้อความแล้ว");
  if (action === "add-title") return runMutation(() => addTextElement(true), "เพิ่มหัวเรื่องแล้ว");
  if (action === "duplicate-element") return runMutation(duplicateSelected, "ทำสำเนาแล้ว");
  if (action === "delete-element") return runMutation(deleteSelected, "ลบองค์ประกอบแล้ว");
  if (action === "toggle-lock") return runMutation(toggleSelectedLock, "เปลี่ยนสถานะล็อกแล้ว");
  if (action === "bring-forward") return runMutation(() => moveLayer(1), "เลื่อนเลเยอร์ขึ้นแล้ว");
  if (action === "send-backward") return runMutation(() => moveLayer(-1), "เลื่อนเลเยอร์ลงแล้ว");
  if (action === "add-page") return runMutation(addPage, "เพิ่มหน้าใหม่แล้ว");
  if (action === "duplicate-page") return runMutation(duplicatePage, "ทำสำเนาหน้าแล้ว");
  if (action === "delete-page") return runMutation(deletePage, "ลบหน้าแล้ว");
  if (action === "move-page-back" || action === "move-page-forward") return runMutation(() => moveActivePage(action === "move-page-back" ? -1 : 1), "เรียงหน้าแล้ว");
  if (action === "delete-volume") {
    if (window.confirm("ลบเล่มนี้และหน้าทั้งหมดในเล่มหรือไม่? สามารถกดย้อนกลับได้")) return runMutation(deleteActiveVolume, "ลบเล่มแล้ว");
    return;
  }
  if (action === "delete-chapter") {
    if (window.confirm("ลบบทนี้และหน้าทั้งหมดในบทหรือไม่? สามารถกดย้อนกลับได้")) return runMutation(deleteActiveChapter, "ลบบทแล้ว");
    return;
  }
  if (action === "smart-layout") return runMutation(smartLayout, "Smart Layout จัดหน้าให้แล้ว");
  if (action === "add-volume") return runMutation(addVolume, "เพิ่มเล่มแล้ว");
  if (action === "add-chapter") return runMutation(addChapter, "เพิ่มบทแล้ว");
  if (action === "align-left" || action === "align-center" || action === "align-right" || action === "align-top" || action === "align-middle" || action === "align-bottom") {
    return runMutation(() => alignSelected(action.replace("align-", "") as "left" | "center" | "right" | "top" | "middle" | "bottom"), "จัดแนวแล้ว");
  }
  if (action === "distribute-horizontal" || action === "distribute-vertical") {
    return runMutation(() => distributeSelected(action === "distribute-horizontal" ? "horizontal" : "vertical"), "กระจายระยะแล้ว");
  }
  if (action === "flip-horizontal" || action === "flip-vertical") return runMutation(() => flipSelected(action === "flip-horizontal" ? "horizontal" : "vertical"), "กลับด้านแล้ว");
  if (action === "group-elements") return runMutation(groupSelected, "จัดกลุ่มแล้ว");
  if (action === "ungroup-elements") return runMutation(ungroupSelected, "ยกเลิกกลุ่มแล้ว");
  if (action === "copy") {
    copySelected();
    showToast("คัดลอกแล้ว", "default");
    return;
  }
  if (action === "cut") return runMutation(cutSelected, "ตัดแล้ว");
  if (action === "paste") return runMutation(pasteElements, "วางแล้ว");
  if (action === "remove-orphans") {
    const removed = removeOrphanAssets();
    rerender(removed ? `ล้างรูปที่ไม่ได้ใช้ ${removed} รายการแล้ว` : "ไม่มีรูปที่ไม่ได้ใช้");
    return;
  }
  if (action === "detach-image") return runMutation(detachSelectedImage, "นำรูปออกจากช่องแล้ว");
  if (action === "enter-crop") {
    const element = selectedElement();
    if (element?.kind === "image") {
      runtime.preferences.cropElementId = runtime.preferences.cropElementId === element.id ? null : element.id;
      savePreferences();
      render();
    }
    return;
  }
  if (action === "replace-image") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
    input.onchange = async () => {
      try {
        await handleUploads(input.files, true);
        rerender("เปลี่ยนรูปแล้ว");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "เปลี่ยนรูปไม่สำเร็จ", "danger");
      }
    };
    input.click();
  }
}

appRoot.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (action) {
    event.preventDefault();
    void handleAction(action);
    return;
  }

  const tab = target.closest<HTMLElement>("[data-left-tab]")?.dataset.leftTab as LeftTab | undefined;
  if (tab) {
    runtime.preferences.leftTab = tab;
    savePreferences();
    render();
    return;
  }

  const tool = target.closest<HTMLElement>("[data-tool]")?.dataset.tool as Tool | undefined;
  if (tool) {
    const definition = getToolDefinition(tool);
    if (!definition || !canUseTool(tool)) {
      showToast(definition?.reason ?? "เครื่องมือนี้ยังไม่พร้อมใช้งาน", "default");
      return;
    }
    if (tool === toolId("asset")) {
      document.querySelector<HTMLInputElement>("[data-upload-input]")?.click();
      return;
    }
    if (tool === toolId("alpha-lock")) {
      const layer = activePage().rasterLayers.find((candidate) => candidate.id === runtime.preferences.activeRasterLayerId || candidate.id === runtime.selectedId);
      if (!layer) {
        showToast("เลือก Raster layer ก่อนเปิด Alpha Lock", "default");
        return;
      }
      transact(() => { layer.alphaLock = !layer.alphaLock; });
      rerender(layer.alphaLock ? "เปิด Alpha Lock แล้ว" : "ปิด Alpha Lock แล้ว");
      return;
    }
    if (tool === toolId("layer-mask")) {
      if (applyPixelSelectionAsLayerMask()) rerender("สร้าง Mask จาก Selection แล้ว");
      else showToast("เลือก Raster layer และสร้าง Selection ก่อนใช้ Layer Mask", "default");
      return;
    }
    runtime.preferences.tool = tool;
    savePreferences();
    render();
    return;
  }

  const template = target.closest<HTMLElement>("[data-template]")?.dataset.template;
  if (template) return runMutation(() => applyPanelTemplate(template), "เปลี่ยนโครงช่องแล้ว");

  const bubble = target.closest<HTMLElement>("[data-add-bubble]")?.dataset.addBubble as BubbleVariant | undefined;
  if (bubble) return runMutation(() => addBubble(bubble), "เพิ่มบอลลูนแล้ว");

  const assetId = target.closest<HTMLElement>("[data-add-asset]")?.dataset.addAsset;
  if (assetId) {
    void addAssetToPage(assetId)
      .then(() => rerender("เพิ่มรูปลงหน้าแล้ว"))
      .catch(() => showToast("เพิ่มรูปนี้ไม่สำเร็จ", "danger"));
    return;
  }

  const pageId = target.closest<HTMLElement>("[data-page-id]")?.dataset.pageId;
  if (pageId) {
    runtime.project.activePageId = pageId;
    const page = runtime.project.pages.find((item) => item.id === pageId);
    if (page) {
      runtime.project.activeVolumeId = page.volumeId;
      runtime.project.activeChapterId = page.chapterId;
    }
    setSelection([]);
    persistProject();
    render();
    return;
  }

  const visibilityId = target.closest<HTMLElement>("[data-layer-visibility]")?.dataset.layerVisibility;
  if (visibilityId) {
    transact(() => {
      const element = activePage().elements.find((item) => item.id === visibilityId);
      if (element) element.hidden = !element.hidden;
      const raster = activePage().rasterLayers.find((item) => item.id === visibilityId);
      if (raster) raster.hidden = !raster.hidden;
    });
    render();
    return;
  }

  const lockId = target.closest<HTMLElement>("[data-layer-lock]")?.dataset.layerLock;
  if (lockId) {
    transact(() => {
      const element = activePage().elements.find((item) => item.id === lockId);
      if (element) element.locked = !element.locked;
      const raster = activePage().rasterLayers.find((item) => item.id === lockId);
      if (raster) raster.locked = !raster.locked;
    });
    render();
    return;
  }

  const layerId = target.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId;
  if (layerId) {
    if (activePage().rasterLayers.some((layer) => layer.id === layerId)) {
      selectRasterLayer(layerId);
      savePreferences();
      render();
      return;
    }
    setSelection(event.shiftKey ? [...runtime.selectedIds, layerId] : [layerId]);
    render();
    return;
  }

  const align = target.closest<HTMLElement>("[data-set-align]")?.dataset.setAlign as TextAlign | undefined;
  if (align) {
    setSelectedProperty("align", align);
    render();
  }
});

appRoot.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (target.matches("[data-upload-input]") && target instanceof HTMLInputElement) {
    const input = target;
    void handleUploads(input.files)
      .then((count) => rerender(`เพิ่มรูป ${count} ไฟล์แล้ว`))
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : "เพิ่มรูปไม่สำเร็จ", "danger"))
      .finally(() => {
        input.value = "";
      });
    return;
  }

  const brushPreference = target.dataset.brushPref;
  if (brushPreference) {
    if (brushPreference === "color") runtime.preferences.brushColor = target.value;
    if (brushPreference === "size") runtime.preferences.brushSize = clamp(Number(target.value), 1, 240);
    if (brushPreference === "opacity") runtime.preferences.brushOpacity = clamp(Number(target.value), 0.05, 1);
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-raster-alpha-lock]")) {
    const layer = activePage().rasterLayers.find((candidate) => candidate.id === runtime.selectedId);
    if (layer) transact(() => { layer.alphaLock = (target as HTMLInputElement).checked; });
    render();
    return;
  }

  if (target.matches("[data-raster-mask-enabled]")) {
    const layer = activePage().rasterLayers.find((candidate) => candidate.id === runtime.selectedId);
    if (layer?.mask) transact(() => { if (layer.mask) layer.mask.enabled = (target as HTMLInputElement).checked; });
    render();
    return;
  }

  if (target.matches("[data-export-transparent]")) {
    runtime.preferences.exportTransparent = (target as HTMLInputElement).checked;
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-background]")) {
    runtime.preferences.exportBackgroundColor = target.value;
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-project-name]")) {
    transact(() => {
      runtime.project.name = target.value.trim() || "Untitled Manga";
    });
    render();
    return;
  }

  if (target.matches("[data-hierarchy-volume]")) {
    runtime.project.activeVolumeId = target.value;
    const chapter = runtime.project.chapters.find((item) => item.volumeId === target.value);
    if (chapter) runtime.project.activeChapterId = chapter.id;
    persistProject();
    render();
    return;
  }

  if (target.matches("[data-hierarchy-chapter]")) {
    runtime.project.activeChapterId = target.value;
    const chapter = runtime.project.chapters.find((item) => item.id === target.value);
    const pageId = chapter?.pageIds[0];
    if (chapter && pageId) {
      runtime.project.activeVolumeId = chapter.volumeId;
      runtime.project.activePageId = pageId;
    }
    persistProject();
    render();
    return;
  }

  if (target.matches("[data-hierarchy-volume-name]")) {
    setHierarchyName("volume", target.value);
    render();
    return;
  }

  if (target.matches("[data-hierarchy-chapter-name]")) {
    setHierarchyName("chapter", target.value);
    render();
    return;
  }

  const elementProp = target.dataset.elementProp;
  if (elementProp) {
    if (elementProp === "crop-x" || elementProp === "crop-y") setCropValue(elementProp === "crop-x" ? "x" : "y", Number(target.value) / 100);
    else if (elementProp === "crop-scale") setCropValue("scale", Number(target.value));
    else if (elementProp.startsWith("page-")) setPageProperty(elementProp, target.value);
    else setSelectedProperty(
      elementProp,
      target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value,
    );
    render();
    return;
  }

  const projectProp = target.dataset.projectProp;
  if (projectProp) {
    setProjectProperty(projectProp, target.value);
    render();
  }
});

appRoot.addEventListener("pointerdown", (event) => {
  if (!(event instanceof PointerEvent)) return;
  const target = event.target as HTMLElement;

  if (runtime.preferences.tool === "hand" && target.closest("[data-stage-viewport]")) {
    event.preventDefault();
    beginPan(event);
    return;
  }

  const activeTool = runtime.preferences.tool;
  if (target.closest("[data-page-canvas]") && applyCanvasTool(event, activeTool)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const selectionMode = selectionModeForTool(activeTool);
  if (selectionMode && target.closest("[data-page-canvas]")) {
    event.preventDefault();
    event.stopPropagation();
    beginPixelSelection(event, selectionMode);
    return;
  }
  if (activeTool === toolId("selection-eraser") && target.closest("[data-page-canvas]")) {
    event.preventDefault();
    clearPixelSelection();
    render();
    return;
  }
  if (isRasterTool(activeTool) && target.closest("[data-page-canvas]")) {
    event.preventDefault();
    event.stopPropagation();
    beginRasterStroke(event, activeTool);
    return;
  }
  if (activeTool === toolId("zoom") && target.closest("[data-page-canvas]")) {
    event.preventDefault();
    runtime.preferences.zoom = clamp(Number((runtime.preferences.zoom + (event.shiftKey ? -0.1 : 0.1)).toFixed(2)), 0.25, 1.5);
    savePreferences();
    render();
    return;
  }

  const cropHandle = target.closest<HTMLElement>("[data-crop-resize]");
  if (cropHandle) {
    event.preventDefault();
    event.stopPropagation();
    const node = cropHandle.closest<HTMLElement>("[data-element-id]");
    const element = node ? activePage().elements.find((item) => item.id === node.dataset.elementId) : null;
    if (node && element?.kind === "image") beginCropResize(event, element, node, cropHandle.dataset.cropResize ?? "se");
    return;
  }

  const cropSelection = target.closest<HTMLElement>("[data-crop-move]");
  if (cropSelection) {
    event.preventDefault();
    event.stopPropagation();
    const node = cropSelection.closest<HTMLElement>("[data-element-id]");
    const element = node ? activePage().elements.find((item) => item.id === node.dataset.elementId) : null;
    if (node && element?.kind === "image") {
      setSelection([element.id]);
      beginCropMove(event, element, node);
    }
    return;
  }

  const resizeHandle = target.closest<HTMLElement>("[data-resize]");
  if (resizeHandle) {
    event.preventDefault();
    event.stopPropagation();
    const node = resizeHandle.closest<HTMLElement>("[data-element-id]");
    const element = selectedElement();
    if (node && element) beginResize(event, element, node, resizeHandle.dataset.resize ?? "se");
    return;
  }

  const rotateHandle = target.closest<HTMLElement>("[data-rotate]");
  if (rotateHandle) {
    event.preventDefault();
    event.stopPropagation();
    const node = rotateHandle.closest<HTMLElement>("[data-element-id]");
    const element = selectedElement();
    if (node && element) beginRotate(event, element, node);
    return;
  }

  const elementNode = target.closest<HTMLElement>("[data-element-id]");
  if (elementNode) {
    event.preventDefault();
    event.stopPropagation();
    const id = elementNode.dataset.elementId;
    if (!id) return;
    const currentIds = new Set(runtime.selectedIds);
    if (event.shiftKey) {
      if (currentIds.has(id)) currentIds.delete(id);
      else currentIds.add(id);
      setSelection([...currentIds]);
      if (!currentIds.has(id)) return;
    } else {
      setSelection([id]);
    }
    const node = updateSelectionDom(id) ?? elementNode;
    const element = selectedElement();
    if (element) beginMove(event, element, node);
    return;
  }

  if (target.closest("[data-page-canvas]")) {
    if (runtime.preferences.tool === "select" && !event.shiftKey) beginSelectionRectangle(event);
    else {
      setSelection([]);
      render();
    }
  }
});

appRoot.addEventListener("dblclick", (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>("[data-element-id]");
  const element = activePage().elements.find((item) => item.id === node?.dataset.elementId);
  if (!element) return;
  if (element.kind === "image") {
    runtime.preferences.cropElementId = element.id;
    setSelection([element.id]);
    savePreferences();
    render();
    return;
  }
  if (element.kind !== "text" && element.kind !== "bubble") return;
  const editor = node?.querySelector<HTMLElement>(element.kind === "text" ? ".text-content" : ".bubble-shape > div");
  if (!editor) return;
  editor.contentEditable = "true";
  editor.focus();
  const finish = (): void => {
    editor.contentEditable = "false";
    const text = editor.innerText.replace(/\r\n/g, "\n");
    if (text === element.text) return;
    transact(() => {
      element.text = text;
      setSelection([element.id]);
    });
    render();
  };
  editor.addEventListener("blur", finish, { once: true });
  editor.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key === "Escape") {
      editor.textContent = element.text;
      editor.blur();
    }
    if (keyEvent.key === "Enter" && !keyEvent.shiftKey && element.kind === "bubble") {
      keyEvent.preventDefault();
      editor.blur();
    }
  });
});

window.addEventListener("keydown", (event) => {
  const active = document.activeElement;
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  const command = event.ctrlKey || event.metaKey;

  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoProject();
    else undoProject();
    rerender();
    return;
  }
  if (command && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoProject();
    rerender();
    return;
  }
  if (command && event.key.toLowerCase() === "s") {
    event.preventDefault();
    persistProject();
    rerender("บันทึกโปรเจกต์แล้ว");
    return;
  }
  if (command && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelected();
    return;
  }
  if (command && event.key.toLowerCase() === "x") {
    event.preventDefault();
    cutSelected();
    rerender("ตัดแล้ว");
    return;
  }
  if (command && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteElements();
    rerender("วางแล้ว");
    return;
  }
  if (command && event.key.toLowerCase() === "g") {
    event.preventDefault();
    if (event.shiftKey) ungroupSelected();
    else groupSelected();
    rerender(event.shiftKey ? "ยกเลิกกลุ่มแล้ว" : "จัดกลุ่มแล้ว");
    return;
  }
  if (typing) return;

  const shortcutTool = !command && !event.altKey ? resolveToolShortcut(event.key) : null;
  if (shortcutTool) {
    runtime.preferences.tool = shortcutTool;
    savePreferences();
    render();
    return;
  }
  const selectedRaster = activePage().rasterLayers.some((layer) => layer.id === runtime.selectedId);
  if ((event.key === "Delete" || event.key === "Backspace") && (selectedElements().length || selectedRaster)) {
    event.preventDefault();
    deleteSelected();
    rerender("ลบองค์ประกอบแล้ว");
  }
  if (command && event.key.toLowerCase() === "d" && selectedElements().length) {
    event.preventDefault();
    duplicateSelected();
    rerender("ทำสำเนาแล้ว");
  }

  const elements = selectedElements();
  if (elements.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    transact(() => {
      elements.forEach((element) => {
        if (event.key === "ArrowUp") element.y -= amount;
        if (event.key === "ArrowDown") element.y += amount;
        if (event.key === "ArrowLeft") element.x -= amount;
        if (event.key === "ArrowRight") element.x += amount;
      });
    });
    render();
  }
});

window.addEventListener("beforeunload", () => persistProject());
render();
void initializePersistence().then(() => render());
