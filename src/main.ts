import "./styles.css";
import { downloadBlobFile, exportScaleForMode, pagesForScope } from "./export";
import { localExportJobRunner } from "./export/runner";
import { exportProjectBundle, importProjectBundle } from "./persistence/archive";
import { hydrateAssetSources } from "./persistence/serialization";
import { renderRasterLayer } from "./editor/raster";
import { addRasterLayer, applyPixelSelectionAsLayerMask, clearPixelSelection, clearRasterLayer, ensureRasterLayer, invertRasterLayerMask, persistRasterCanvas, recordRasterStroke, removeRasterLayerMask, selectRasterLayer, splitLastStrokeToLayer } from "./editor/raster-actions";
import { buildContiguousPixelSelection, buildPixelSelection, clientToPagePoint, clientToRotatedPagePoint, isEraserToolId, isUsablePixelSelection, projectPointToRuler, rasterStrokeKindForToolId, selectionModeForToolId } from "./editor/interactions";
import { canUseTool, getToolDefinition, isRasterTool, toolId } from "./editor/tools";
import {
  addAssetToPage,
  addBubble,
  addPanel,
  addTextElement,
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
  duplicateSelected,
  flipSelected,
  groupSelected,
  getCropRect,
  handleUploads,
  moveLayer,
  pasteElements,
  pasteCroppedSelectionAsImage,
  removeOrphanAssets,
  resetImageEdits,
  setPageProperty,
  setProjectProperty,
  setCropRect,
  setCropValue,
  setHierarchyName,
  setSelectedProperty,
  smartLayout,
  toggleSelectedLock,
  ungroupSelected,
} from "./editor/actions";
import {
  addProjectChapter,
  addProjectPage,
  addProjectVolume,
  activateProjectChapter,
  activateProjectPage,
  activateProjectVolume,
  duplicateProjectChapter,
  duplicateProjectPage,
  duplicateProjectVolume,
  moveProjectPage,
  reorderProjectChapters,
  reorderProjectPages,
  reorderProjectVolumes,
} from "./editor/hierarchy";
import {
  activePage,
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
import { applyPagePreset, setDocumentMetadata, type DocumentMetadataProperty } from "./editor/document";
import { splitPanelAtPoint } from "./editor/panels";
import { addBubbleTail, applyEmbeddedFont, applyTextStylePreset, removeBubbleTail, removeTextStylePreset, saveSelectedTextStyle } from "./editor/text-actions";
import { handleFontUploads, registerProjectFonts, removeEmbeddedFont } from "./editor/font-assets";
import { handleEditorKeydown } from "./editor/keyboard";
import { createGestureController, pagePosition } from "./app/gestures";
import type { BubbleVariant, ExportFormat, ExportScaleMode, ExportScope, ImageElement, LeftTab, PagePreset, PixelSelectionShape, RasterPoint, RasterStroke, TextAlign, Tool } from "./types";
import { contentAwareFillPixels, contentAwareSelectionArea, MAX_LOCAL_CONTENT_AWARE_PIXELS } from "./editor/content-aware";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");
const appRoot: HTMLDivElement = root;
let toastTimer: number | undefined;
let hierarchyDrag: { kind: "volume" | "chapter" | "page"; id: string } | null = null;
let exportAbortController: AbortController | null = null;

function render(): void {
  appRoot.innerHTML = renderApp();
  const page = activePage();
  document.querySelectorAll<HTMLCanvasElement>("[data-raster-layer-id]").forEach((canvas) => {
    const layer = page.rasterLayers.find((candidate) => candidate.id === canvas.dataset.rasterLayerId);
    if (!layer) return;
    const preview = runtime.preferences.activeRasterLayerId === layer.id ? runtime.rasterPreview : null;
    renderRasterLayer(canvas, page, layer, preview);
  });
  const selectionCanvas = document.querySelector<HTMLCanvasElement>("[data-pixel-selection-canvas]");
  const selection = runtime.pixelSelection;
  const selectionContext = selectionCanvas?.getContext("2d");
  if (selectionCanvas && selectionContext && selection?.mode === "pixels") {
    selectionContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    selectionContext.fillStyle = "rgba(99,230,255,.22)";
    for (const span of selection.spans ?? []) selectionContext.fillRect(span.x, span.y, span.width, 1);
    selectionContext.strokeStyle = "#63e6ff";
    selectionContext.setLineDash([5, 4]);
    selectionContext.strokeRect(selection.x + 0.5, selection.y + 0.5, Math.max(1, selection.width - 1), Math.max(1, selection.height - 1));
  }
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

function beginSelectionRectangle(event: PointerEvent): void {
  const canvas = document.querySelector<HTMLElement>("[data-page-canvas]");
  if (!canvas) return;
  const releasePointer = capturePointer(event);
  const startPoint = pagePoint(event);
  const startX = startPoint.x;
  const startY = startPoint.y;
  runtime.selectionRectangle = { x: startX, y: startY, width: 0, height: 0 };
  render();
  const update = (moveEvent: PointerEvent): void => {
    const currentPoint = pagePoint(moveEvent);
    const currentX = currentPoint.x;
    const currentY = currentPoint.y;
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
  const bounds = canvas.getBoundingClientRect();
  return Math.abs(runtime.preferences.canvasRotation) < 0.001
    ? clientToPagePoint(event, bounds, page)
    : clientToRotatedPagePoint(event, bounds, page, runtime.preferences.canvasRotation);
}

const { beginMove, beginCropDraw, beginCropMove, beginCropResize, beginResize, beginRotate, beginPan, beginCanvasRotation, moveNavigatorTo } = createGestureController({ pagePoint, render, rerender });

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

function applyContiguousPixelSelection(event: PointerEvent, tool: Tool): void {
  const page = activePage();
  const preferred = activeRasterCanvas();
  const preferredLayer = page.rasterLayers.find((layer) => layer.id === preferred?.dataset.rasterLayerId);
  const canvas = preferred && !preferredLayer?.hidden
    ? preferred
    : [...document.querySelectorAll<HTMLCanvasElement>("[data-raster-layer-id]")].reverse().find((candidate) => !page.rasterLayers.find((layer) => layer.id === candidate.dataset.rasterLayerId)?.hidden);
  const context = canvas?.getContext("2d", { willReadFrequently: true });
  if (!canvas || !context) {
    showToast("Magic Wand ต้องใช้ Raster layer ที่มองเห็นได้", "default");
    return;
  }
  try {
    const point = pagePoint(event);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const selection = buildContiguousPixelSelection(pixels, canvas.width, canvas.height, point.x, point.y, tool === toolId("quick-selection") ? 48 : 24);
    if (!selection) {
      showToast("พื้นที่ใหญ่เกิน guardrail หรือไม่พบสีที่เลือก", "danger");
      return;
    }
    runtime.pixelSelection = selection;
    render();
    showToast(`เลือกพื้นที่สี ${selection.width}×${selection.height}px แล้ว`, "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "อ่าน pixels สำหรับ Selection ไม่สำเร็จ", "danger");
  }
}

function beginRasterRuler(event: PointerEvent, kind: "straight" | "symmetry"): void {
  const releasePointer = capturePointer(event);
  const start = pagePoint(event);
  runtime.preferences.rasterRuler = { kind, start, end: { ...start } };
  render();
  const update = (moveEvent: PointerEvent): void => {
    const ruler = runtime.preferences.rasterRuler;
    if (!ruler) return;
    ruler.end = pagePoint(moveEvent);
    render();
  };
  const end = (): void => {
    window.removeEventListener("pointermove", update);
    releasePointer();
    const ruler = runtime.preferences.rasterRuler;
    if (!ruler || Math.hypot(ruler.end.x - ruler.start.x, ruler.end.y - ruler.start.y) < 8) {
      runtime.preferences.rasterRuler = null;
      render();
      showToast("ลากแนวไม้บรรทัดให้ยาวอย่างน้อย 8 px", "danger");
      return;
    }
    runtime.preferences.tool = toolId("brush");
    savePreferences();
    render();
    showToast(kind === "symmetry" ? "ตั้งแกนสมมาตรแล้ว • Stroke ถัดไปจะสะท้อนอีกด้าน" : "ตั้งไม้บรรทัดตรงแล้ว • Stroke จะเกาะแนวนี้", "success");
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", end, { once: true });
}

function beginRasterStroke(event: PointerEvent, tool: Tool): void {
  if (["lasso-fill", "enclose-fill", "close-fill"].includes(tool as string) && !runtime.pixelSelection) {
    showToast("ใช้ Lasso หรือ Marquee เลือกพื้นที่ก่อนเติมสี", "danger");
    return;
  }
  if (tool === toolId("content-aware-fill")) {
    if (!runtime.pixelSelection) {
      showToast("เลือกพื้นที่ด้วย Lasso, Marquee หรือ Magic Wand ก่อนใช้ Content-Aware Fill", "danger");
      return;
    }
    if (contentAwareSelectionArea(runtime.pixelSelection) > MAX_LOCAL_CONTENT_AWARE_PIXELS) {
      showToast(`Content-Aware Fill แบบ local รองรับไม่เกิน ${MAX_LOCAL_CONTENT_AWARE_PIXELS.toLocaleString()} pixels ต่อครั้ง`, "danger");
      return;
    }
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
  const ruler = runtime.preferences.rasterRuler;
  const rulerApplies = kind === "stroke" || kind === "filter";
  const constrainedPoint = (pointerEvent: PointerEvent): RasterPoint => {
    const point = pagePoint(pointerEvent);
    return rulerApplies && ruler?.kind === "straight" ? projectPointToRuler(point, ruler) : point;
  };
  const start = constrainedPoint(event);
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
    mirrorAxis: kind === "stroke" && ruler?.kind === "symmetry" ? structuredClone(ruler) : undefined,
  };
  if (!activeRasterCanvas()) render();
  if (kind === "fill" || kind === "bucket" || kind === "erase-fill" || kind === "content-fill") {
    if (kind === "content-fill" && stroke.selection) {
      const canvas = activeRasterCanvas();
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !context) {
        releasePointer();
        showToast("อ่าน Raster layer สำหรับ Content-Aware Fill ไม่สำเร็จ", "danger");
        return;
      }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data.slice();
      if (!contentAwareFillPixels(pixels, canvas.width, canvas.height, stroke.selection, stroke.opacity, stroke.preserveAlpha)) {
        releasePointer();
        showToast("พื้นที่นี้ไม่มีสีขอบบน Raster layer ให้ใช้เติม", "danger");
        return;
      }
    }
    recordRasterStroke(stroke);
    render();
    const canvas = activeRasterCanvas();
    if (canvas) void persistRasterCanvas(canvas);
    releasePointer();
    showToast(kind === "content-fill" ? "เติมพื้นที่จากสีขอบแบบ local แล้ว" : "เติมสีบน Raster layer แล้ว", "success");
    return;
  }
  runtime.rasterPreview = stroke;
  const update = (moveEvent: PointerEvent): void => {
    stroke.points.push(constrainedPoint(moveEvent));
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
  if (id === "straight-ruler" || id === "symmetry-ruler") {
    beginRasterRuler(event, id === "symmetry-ruler" ? "symmetry" : "straight");
    return true;
  }
  if (id === "grid") {
    runtime.preferences.showGrid = !runtime.preferences.showGrid;
    savePreferences();
    render();
    return true;
  }
  if (id === "crop") {
    const image = selectedElement();
    startCropWorkflow(image?.kind === "image" ? image : null);
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
      const x = clamp(point.x - element.x, 0, element.width);
      const y = clamp(point.y - element.y, 0, element.height * 1.6);
      const nearest = event.shiftKey ? null : element.tails.reduce<{ id: string; distance: number } | null>((best, tail) => {
        const distance = Math.hypot(tail.x - x, tail.y - y);
        return !best || distance < best.distance ? { id: tail.id, distance } : best;
      }, null);
      if (nearest) {
        const tail = element.tails.find((candidate) => candidate.id === nearest.id);
        if (tail) { tail.x = x; tail.y = y; }
      } else element.tails.push({ id: `tail_${Date.now()}_${element.tails.length}`, x, y });
      element.tailX = element.tails[0]?.x ?? x;
      element.tailY = element.tails[0]?.y ?? y;
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
  if (id === "panel-cutter" || id === "divide-frame") {
    const result = splitPanelAtPoint(pagePoint(event), id === "divide-frame", event.shiftKey);
    if (result) {
      render();
      showToast("ตัด Panel เป็นสองช่องแล้ว", "success");
    } else showToast("เลือกหรือคลิก Panel ที่ต้องการตัด", "default");
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
  if (id === "skew") {
    const elements = selectedElements();
    if (elements.length) {
      transact(() => elements.forEach((element) => {
        element.skewX = clamp(element.skewX + (event.shiftKey ? -5 : 5), -75, 75);
      }));
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
  if (exportAbortController) return;
  const format = runtime.preferences.exportFormat;
  const scope = runtime.preferences.exportScope;
  const pages = pagesForScope(runtime.project, scope);
  exportAbortController = new AbortController();
  runtime.exportTask = { status: "running", completed: 0, total: pages.length, label: `กำลังสร้าง ${format.toUpperCase()}` };
  render();
  let outcome: { message: string; tone: "default" | "success" | "danger" } = { message: "ส่งออกไม่สำเร็จ", tone: "danger" };
  try {
    const backgroundColor = format === "png" && runtime.preferences.exportTransparent
      ? null
      : format === "jpg" || format === "pdf" || format === "cbz"
        ? runtime.preferences.exportBackgroundColor
        : undefined;
    const scale = exportScaleForMode(runtime.preferences.exportScaleMode, runtime.preferences.exportCustomScale, runtime.project.dpi);
    await localExportJobRunner.run(runtime.project, runtime.project.name, {
      format,
      scope,
      scale,
      backgroundColor,
      maxWebtoonHeight: runtime.preferences.exportMaxWebtoonHeight,
      includeBleed: runtime.preferences.exportIncludeBleed,
      cropMarks: runtime.preferences.exportCropMarks,
      signal: exportAbortController.signal,
      onProgress: (completed, total) => {
        runtime.exportTask = { ...runtime.exportTask, completed, total };
        render();
      },
    });
    outcome = { message: runtime.project.colorMode === "cmyk"
      ? `ส่งออก ${format.toUpperCase()} แบบ RGB แล้ว • CMYK ยังเป็น metadata`
      : `ส่งออก ${format.toUpperCase()} แล้ว`, tone: "success" };
  } catch (error) {
    outcome = error instanceof DOMException && error.name === "AbortError"
      ? { message: "ยกเลิกการส่งออกแล้ว", tone: "default" }
      : { message: error instanceof Error ? error.message : "ส่งออกไม่สำเร็จ", tone: "danger" };
  } finally {
    exportAbortController = null;
    runtime.exportTask = { status: "idle", completed: 0, total: 0, label: "" };
    render();
    showToast(outcome.message, outcome.tone);
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
      await registerProjectFonts(runtime.project);
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

function cropWorkflowElement(): ImageElement | null {
  const id = runtime.preferences.cropElementId;
  if (!id) return null;
  const element = activePage().elements.find((candidate) => candidate.id === id);
  return element?.kind === "image" ? element : null;
}

function closeCropWorkflow(): void {
  runtime.preferences.cropElementId = null;
  runtime.preferences.tool = toolId("select");
  runtime.cropSession = null;
  savePreferences();
}

function startCropWorkflow(image: ImageElement | null): void {
  if (!image) {
    showToast("เลือกรูปก่อน แล้วกด ‘ตัดและวางรูป’", "default");
    return;
  }
  const previousSession = runtime.cropSession;
  if (previousSession && previousSession.elementId !== image.id) {
    const previous = activePage().elements.find((candidate) => candidate.id === previousSession.elementId);
    if (previous?.kind === "image") previous.crop = structuredClone(previousSession.original);
    runtime.historyPast.length = previousSession.historyPastLength;
    runtime.historyFuture = [...previousSession.historyFuture];
    persistProject();
  }
  runtime.cropSession = {
    elementId: image.id,
    original: structuredClone(image.crop),
    historyPastLength: runtime.historyPast.length,
    historyFuture: [...runtime.historyFuture],
  };
  const crop = getCropRect(image);
  const isFullImage = crop.left < 0.001 && crop.top < 0.001 && crop.width > 0.999 && crop.height > 0.999;
  if (isFullImage) transact(() => setCropRect(image, { left: 0.12, top: 0.12, width: 0.76, height: 0.76 }));
  runtime.preferences.cropElementId = image.id;
  runtime.preferences.tool = toolId("select");
  setSelection([image.id]);
  savePreferences();
  render();
  showToast("ลากพื้นที่มืดเพื่อวาดกรอบใหม่ แล้วกดตัดหรือวาง", "default");
}

function cancelCropWorkflow(): void {
  const session = runtime.cropSession;
  const image = cropWorkflowElement();
  if (session && image?.id === session.elementId) {
    image.crop = structuredClone(session.original);
    runtime.historyPast.length = session.historyPastLength;
    runtime.historyFuture = [...session.historyFuture];
    persistProject();
  }
  closeCropWorkflow();
  rerender("ยกเลิกการตัดรูปแล้ว", "default");
}

function applyCropWorkflow(): void {
  const image = cropWorkflowElement();
  if (!image) return;
  const finalCrop = structuredClone(image.crop);
  const session = runtime.cropSession;
  if (session?.elementId === image.id) {
    image.crop = structuredClone(session.original);
    runtime.historyPast.length = session.historyPastLength;
    runtime.historyFuture = [...session.historyFuture];
    transact(() => { image.crop = finalCrop; });
  } else persistProject();
  closeCropWorkflow();
  setSelection([image.id]);
  rerender("ครอปรูปเดิมแล้ว");
}

function resetCropSelection(fullImage: boolean): void {
  const image = cropWorkflowElement();
  if (!image) return;
  transact(() => setCropRect(image, fullImage
    ? { left: 0, top: 0, width: 1, height: 1 }
    : { left: 0.15, top: 0.15, width: 0.7, height: 0.7 }));
  rerender(fullImage ? "เลือกทั้งรูปแล้ว" : "เริ่มกรอบใหม่แล้ว", "default");
}

function pasteCropWorkflow(): void {
  const image = cropWorkflowElement();
  if (!image) return;
  const session = runtime.cropSession;
  const original = session?.elementId === image.id ? session.original : structuredClone(image.crop);
  if (session?.elementId === image.id) {
    runtime.historyPast.length = session.historyPastLength;
    runtime.historyFuture = [...session.historyFuture];
  }
  setSelection([image.id]);
  const pieceId = pasteCroppedSelectionAsImage(original);
  closeCropWorkflow();
  if (pieceId) {
    setSelection([pieceId]);
    rerender("ตัดส่วนที่เลือกเป็นรูปใหม่แล้ว — ลากไปวางได้ทันที");
  }
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
  if (action === "reset-canvas-view") {
    runtime.preferences.zoom = 0.62;
    runtime.preferences.canvasRotation = 0;
    savePreferences();
    render();
    return;
  }
  if (action === "export") return exportCurrentPage();
  if (action === "cancel-export") {
    exportAbortController?.abort();
    runtime.exportTask = { ...runtime.exportTask, status: "cancelled" };
    showToast("กำลังยกเลิกการส่งออก…", "default");
    return;
  }
  if (action === "export-project") return exportProjectFile();
  if (action === "import-project") {
    importProjectFile();
    return;
  }
  if (action === "open-upload") {
    document.querySelector<HTMLInputElement>("[data-upload-input]")?.click();
    return;
  }
  if (action === "open-font-upload") {
    document.querySelector<HTMLInputElement>("[data-font-upload-input]")?.click();
    return;
  }
  if (action === "clear-raster-ruler") {
    runtime.preferences.rasterRuler = null;
    savePreferences();
    render();
    showToast("ปิดไม้บรรทัดแล้ว", "default");
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
  if (action === "save-text-style") {
    const styleId = saveSelectedTextStyle();
    if (styleId) rerender("บันทึก Text style แล้ว");
    else showToast("เลือกข้อความหรือบอลลูนก่อนบันทึกสไตล์", "default");
    return;
  }
  if (action === "add-bubble-tail") {
    const tailId = addBubbleTail();
    if (tailId) rerender("เพิ่มหางบอลลูนแล้ว");
    else showToast("เลือกบอลลูนก่อนเพิ่มหาง", "default");
    return;
  }
  if (action === "duplicate-element") return runMutation(duplicateSelected, "ทำสำเนาแล้ว");
  if (action === "delete-element") return runMutation(deleteSelected, "ลบองค์ประกอบแล้ว");
  if (action === "toggle-lock") return runMutation(toggleSelectedLock, "เปลี่ยนสถานะล็อกแล้ว");
  if (action === "bring-forward") return runMutation(() => moveLayer(1), "เลื่อนเลเยอร์ขึ้นแล้ว");
  if (action === "send-backward") return runMutation(() => moveLayer(-1), "เลื่อนเลเยอร์ลงแล้ว");
  if (action === "add-page") return runMutation(addProjectPage, "เพิ่มหน้าใหม่แล้ว");
  if (action === "duplicate-page") return runMutation(duplicateProjectPage, "ทำสำเนาหน้าแล้ว");
  if (action === "delete-page") return runMutation(deletePage, "ลบหน้าแล้ว");
  if (action === "move-page-back" || action === "move-page-forward") return runMutation(() => moveProjectPage(action === "move-page-back" ? -1 : 1), "เรียงหน้าแล้ว");
  if (action === "delete-volume") {
    if (window.confirm("ลบเล่มนี้และหน้าทั้งหมดในเล่มหรือไม่? สามารถกดย้อนกลับได้")) return runMutation(deleteActiveVolume, "ลบเล่มแล้ว");
    return;
  }
  if (action === "delete-chapter") {
    if (window.confirm("ลบบทนี้และหน้าทั้งหมดในบทหรือไม่? สามารถกดย้อนกลับได้")) return runMutation(deleteActiveChapter, "ลบบทแล้ว");
    return;
  }
  if (action === "smart-layout") return runMutation(smartLayout, "Smart Layout จัดหน้าให้แล้ว");
  if (action === "add-volume") return runMutation(addProjectVolume, "เพิ่มเล่มพร้อมหน้าแรกแล้ว");
  if (action === "add-chapter") return runMutation(addProjectChapter, "เพิ่มบทพร้อมหน้าแรกแล้ว");
  if (action === "duplicate-volume") return runMutation(duplicateProjectVolume, "ทำสำเนาเล่มแล้ว");
  if (action === "duplicate-chapter") return runMutation(duplicateProjectChapter, "ทำสำเนาบทแล้ว");
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
  if (action === "start-crop") {
    const element = selectedElement();
    startCropWorkflow(element?.kind === "image" ? element : null);
    return;
  }
  if (action === "reset-crop-selection") return resetCropSelection(false);
  if (action === "crop-full-selection") return resetCropSelection(true);
  if (action === "cancel-crop") return cancelCropWorkflow();
  if (action === "apply-crop") return applyCropWorkflow();
  if (action === "paste-crop") return pasteCropWorkflow();
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

  const textStyleId = target.closest<HTMLElement>("[data-apply-text-style]")?.dataset.applyTextStyle;
  if (textStyleId) {
    if (applyTextStylePreset(textStyleId)) rerender("ใช้ Text style แล้ว");
    return;
  }

  const fontAssetId = target.closest<HTMLElement>("[data-apply-font]")?.dataset.applyFont;
  if (fontAssetId) {
    if (applyEmbeddedFont(fontAssetId)) rerender("ใช้ฟอนต์ที่ฝังแล้ว");
    else showToast("เลือกข้อความหรือบอลลูนก่อนใช้ฟอนต์", "default");
    return;
  }

  const removeFontId = target.closest<HTMLElement>("[data-remove-font]")?.dataset.removeFont;
  if (removeFontId) {
    if (removeEmbeddedFont(removeFontId)) rerender("ลบฟอนต์ฝังและใช้ฟอนต์ระบบแทนแล้ว");
    return;
  }

  const removeStyleId = target.closest<HTMLElement>("[data-remove-text-style]")?.dataset.removeTextStyle;
  if (removeStyleId) {
    if (removeTextStylePreset(removeStyleId)) rerender("ลบ Text style แล้ว");
    return;
  }

  const removeTailId = target.closest<HTMLElement>("[data-remove-bubble-tail]")?.dataset.removeBubbleTail;
  if (removeTailId) {
    if (removeBubbleTail(removeTailId)) rerender("ลบหางบอลลูนแล้ว");
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
    if (tool === toolId("navigator")) {
      runtime.preferences.showNavigator = !runtime.preferences.showNavigator;
      runtime.preferences.tool = toolId("select");
      savePreferences();
      render();
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
    if (tool === toolId("crop")) {
      const image = selectedElement();
      if (image?.kind === "image") {
        startCropWorkflow(image);
        return;
      }
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
    activateProjectPage(pageId);
    persistProject();
    render();
    return;
  }

  const volumeId = target.closest<HTMLElement>("[data-hierarchy-select-volume]")?.dataset.hierarchySelectVolume;
  if (volumeId) {
    activateProjectVolume(volumeId);
    persistProject();
    render();
    return;
  }

  const chapterId = target.closest<HTMLElement>("[data-hierarchy-select-chapter]")?.dataset.hierarchySelectChapter;
  if (chapterId) {
    activateProjectChapter(chapterId);
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

  if (target.matches("[data-font-upload-input]") && target instanceof HTMLInputElement) {
    const input = target;
    void handleFontUploads(input.files)
      .then((count) => rerender(`ฝังฟอนต์ ${count} ไฟล์แล้ว`))
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : "ฝังฟอนต์ไม่สำเร็จ", "danger"))
      .finally(() => { input.value = ""; });
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

  if (target.matches("[data-export-format]")) {
    const format = target.value as ExportFormat;
    if (["png", "jpg", "pdf", "cbz", "zip", "webtoon"].includes(format)) runtime.preferences.exportFormat = format;
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-scope]")) {
    const scope = target.value as ExportScope;
    if (["page", "chapter", "volume", "project"].includes(scope)) runtime.preferences.exportScope = scope;
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-scale-mode]")) {
    const mode = target.value as ExportScaleMode;
    if (["1x", "2x", "300dpi", "custom"].includes(mode)) runtime.preferences.exportScaleMode = mode;
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-custom-scale]")) {
    runtime.preferences.exportCustomScale = clamp(Number(target.value), 0.25, 8);
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-max-height]")) {
    runtime.preferences.exportMaxWebtoonHeight = Math.round(clamp(Number(target.value), 1000, 32000));
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-include-bleed]")) {
    runtime.preferences.exportIncludeBleed = (target as HTMLInputElement).checked;
    savePreferences();
    render();
    return;
  }

  if (target.matches("[data-export-crop-marks]")) {
    runtime.preferences.exportCropMarks = (target as HTMLInputElement).checked;
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

  if (target.matches("[data-page-preset]")) {
    if (applyPagePreset(target.value as PagePreset)) rerender("เปลี่ยน Page preset และปรับสัดส่วนเนื้อหาแล้ว");
    else showToast("Page preset ไม่ถูกต้อง", "danger");
    return;
  }

  const documentProperty = target.dataset.documentProp as DocumentMetadataProperty | undefined;
  if (documentProperty) {
    if (setDocumentMetadata(documentProperty, target.value)) render();
    else showToast("ค่าตั้งค่าเอกสารไม่ถูกต้อง", "danger");
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
    activateProjectVolume(target.value);
    persistProject();
    render();
    return;
  }

  if (target.matches("[data-hierarchy-chapter]")) {
    activateProjectChapter(target.value);
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

appRoot.addEventListener("dragstart", (event) => {
  if (!(event instanceof DragEvent)) return;
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-hierarchy-drag-kind][data-hierarchy-drag-id]");
  const kind = row?.dataset.hierarchyDragKind;
  const id = row?.dataset.hierarchyDragId;
  if (!row || !id || (kind !== "volume" && kind !== "chapter" && kind !== "page")) return;
  hierarchyDrag = { kind, id };
  event.dataTransfer?.setData("text/plain", `${kind}:${id}`);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  row.classList.add("is-dragging");
});

appRoot.addEventListener("dragover", (event) => {
  if (!(event instanceof DragEvent) || !hierarchyDrag) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-hierarchy-drag-kind][data-hierarchy-drag-id]");
  if (!target || target.dataset.hierarchyDragKind !== hierarchyDrag.kind || target.dataset.hierarchyDragId === hierarchyDrag.id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  target.classList.add("is-drop-target");
});

appRoot.addEventListener("drop", (event) => {
  if (!(event instanceof DragEvent) || !hierarchyDrag) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-hierarchy-drag-kind][data-hierarchy-drag-id]");
  const targetId = target?.dataset.hierarchyDragId;
  if (!targetId || target?.dataset.hierarchyDragKind !== hierarchyDrag.kind) return;
  event.preventDefault();
  const moved = hierarchyDrag.kind === "volume"
    ? reorderProjectVolumes(hierarchyDrag.id, targetId)
    : hierarchyDrag.kind === "chapter"
      ? reorderProjectChapters(hierarchyDrag.id, targetId)
      : reorderProjectPages(hierarchyDrag.id, targetId);
  hierarchyDrag = null;
  rerender(moved ? "เรียงโครงสร้างโปรเจกต์แล้ว" : "ย้ายรายการนี้ไม่ได้", moved ? "success" : "default");
});

appRoot.addEventListener("dragend", () => {
  hierarchyDrag = null;
  document.querySelectorAll(".is-dragging, .is-drop-target").forEach((node) => node.classList.remove("is-dragging", "is-drop-target"));
});

appRoot.addEventListener("pointerdown", (event) => {
  if (!(event instanceof PointerEvent)) return;
  const target = event.target as HTMLElement;

  const navigatorMap = target.closest<HTMLElement>("[data-navigator-map]");
  if (navigatorMap) {
    event.preventDefault();
    moveNavigatorTo(event, navigatorMap);
    return;
  }

  if (runtime.preferences.tool === "hand" && target.closest("[data-stage-viewport]")) {
    event.preventDefault();
    beginPan(event);
    return;
  }

  const activeTool = runtime.preferences.tool;
  if ((activeTool === toolId("magic-wand") || activeTool === toolId("quick-selection")) && target.closest("[data-page-canvas]")) {
    event.preventDefault();
    applyContiguousPixelSelection(event, activeTool);
    return;
  }
  if (activeTool === toolId("rotate-canvas") && target.closest("[data-page-canvas]")) {
    event.preventDefault();
    beginCanvasRotation(event);
    return;
  }
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

  const cropSurface = target.closest<HTMLElement>("[data-crop-draw]");
  if (cropSurface) {
    event.preventDefault();
    event.stopPropagation();
    const node = cropSurface.closest<HTMLElement>("[data-element-id]");
    const element = node ? activePage().elements.find((item) => item.id === node.dataset.elementId) : null;
    if (node && element?.kind === "image") {
      setSelection([element.id]);
      beginCropDraw(event, element, node);
    }
    return;
  }

  const resizeHandle = target.closest<HTMLElement>("[data-resize]");
  if (resizeHandle) {
    event.preventDefault();
    event.stopPropagation();
    const node = resizeHandle.closest<HTMLElement>("[data-element-id]");
    const element = activePage().elements.find((candidate) => candidate.id === node?.dataset.elementId) ?? null;
    if (node && element) beginResize(event, element, node, resizeHandle.dataset.resize ?? "se");
    return;
  }

  const rotateHandle = target.closest<HTMLElement>("[data-rotate]");
  if (rotateHandle) {
    event.preventDefault();
    event.stopPropagation();
    const node = rotateHandle.closest<HTMLElement>("[data-element-id]");
    const element = activePage().elements.find((candidate) => candidate.id === node?.dataset.elementId) ?? null;
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
    startCropWorkflow(element);
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
  if (!typing && runtime.preferences.cropElementId && event.key === "Escape") {
    event.preventDefault();
    cancelCropWorkflow();
    return;
  }
  if (!typing && runtime.preferences.cropElementId && event.key === "Enter") {
    event.preventDefault();
    applyCropWorkflow();
    return;
  }
  handleEditorKeydown(event, typing, {
    undo: () => { undoProject(); rerender(); },
    redo: () => { redoProject(); rerender(); },
    save: () => { persistProject(); rerender("บันทึกโปรเจกต์แล้ว"); },
    copy: copySelected,
    cut: () => { cutSelected(); rerender("ตัดแล้ว"); },
    paste: () => { pasteElements(); rerender("วางแล้ว"); },
    group: () => { groupSelected(); rerender("จัดกลุ่มแล้ว"); },
    ungroup: () => { ungroupSelected(); rerender("ยกเลิกกลุ่มแล้ว"); },
    selectTool: (tool) => {
      if (tool === toolId("crop")) {
        const image = selectedElement();
        if (image?.kind === "image") {
          startCropWorkflow(image);
          return;
        }
      }
      runtime.preferences.tool = tool;
      savePreferences();
      render();
    },
    hasSelection: () => selectedElements().length > 0 || activePage().rasterLayers.some((layer) => layer.id === runtime.selectedId),
    deleteSelection: () => { deleteSelected(); rerender("ลบองค์ประกอบแล้ว"); },
    duplicateSelection: () => { duplicateSelected(); rerender("ทำสำเนาแล้ว"); },
    nudgeSelection: (direction, amount) => {
      const elements = selectedElements();
      transact(() => {
        elements.forEach((element) => {
          if (direction === "up") element.y -= amount;
          if (direction === "down") element.y += amount;
          if (direction === "left") element.x -= amount;
          if (direction === "right") element.x += amount;
        });
      });
      render();
    },
  });
});

window.addEventListener("beforeunload", () => persistProject());
render();
void initializePersistence().then(() => render());
