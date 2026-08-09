import "./styles.css";
import { exportPagePng } from "./export";
import {
  addAssetToPage,
  addBubble,
  addPage,
  addPanel,
  addTextElement,
  applyPanelTemplate,
  clamp,
  deletePage,
  deleteSelected,
  duplicatePage,
  duplicateSelected,
  handleUploads,
  moveLayer,
  setPageProperty,
  setProjectProperty,
  setSelectedProperty,
  smartLayout,
  toggleSelectedLock,
} from "./editor/actions";
import {
  activePage,
  checkpoint,
  persistProject,
  redoProject,
  runtime,
  savePreferences,
  selectedElement,
  transact,
  undoProject,
} from "./editor/state";
import { renderApp } from "./editor/view";
import type { BubbleVariant, LeftTab, MangaElement, TextAlign, Tool } from "./types";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");
const appRoot: HTMLDivElement = root;
let toastTimer: number | undefined;

function render(): void {
  appRoot.innerHTML = renderApp();
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
  const node = document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`);
  node?.classList.add("is-selected");
  document.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(id)}"]`)?.classList.add("is-active");
  return node;
}

interface DragContext {
  element: MangaElement;
  node: HTMLElement;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

function beginMove(event: PointerEvent, element: MangaElement, node: HTMLElement): void {
  if (element.locked || runtime.preferences.tool !== "select") return;
  checkpoint();
  const context: DragContext = {
    element,
    node,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: element.x,
    startY: element.y,
    startWidth: element.width,
    startHeight: element.height,
  };

  const move = (moveEvent: PointerEvent): void => {
    const dx = (moveEvent.clientX - context.startClientX) / runtime.preferences.zoom;
    const dy = (moveEvent.clientY - context.startClientY) / runtime.preferences.zoom;
    const page = activePage();
    element.x = clamp(context.startX + dx, -element.width + 24, page.width - 24);
    element.y = clamp(context.startY + dy, -element.height + 24, page.height - 24);
    node.style.left = `${element.x}px`;
    node.style.top = `${element.y}px`;
  };

  const end = (): void => {
    window.removeEventListener("pointermove", move);
    persistProject();
    rerender();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginResize(event: PointerEvent, element: MangaElement, node: HTMLElement, handle: string): void {
  if (element.locked) return;
  checkpoint();
  const context: DragContext = {
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
    persistProject();
    rerender();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginRotate(event: PointerEvent, element: MangaElement, node: HTMLElement): void {
  if (element.locked) return;
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
    persistProject();
    rerender();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

function beginPan(event: PointerEvent): void {
  const viewport = document.querySelector<HTMLElement>("[data-stage-viewport]");
  if (!viewport) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const scrollLeft = viewport.scrollLeft;
  const scrollTop = viewport.scrollTop;
  const move = (moveEvent: PointerEvent): void => {
    viewport.scrollLeft = scrollLeft - (moveEvent.clientX - startX);
    viewport.scrollTop = scrollTop - (moveEvent.clientY - startY);
  };
  const end = (): void => window.removeEventListener("pointermove", move);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}

async function exportCurrentPage(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("[data-action='export']");
  if (button) {
    button.disabled = true;
    button.textContent = "กำลังสร้าง PNG…";
  }
  try {
    await exportPagePng(activePage(), `${runtime.project.name}-${activePage().name}`, 2);
    showToast("ส่งออก PNG ความละเอียด 2× แล้ว", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "ส่งออกไม่สำเร็จ", "danger");
  } finally {
    render();
  }
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
  if (action === "smart-layout") return runMutation(smartLayout, "Smart Layout จัดหน้าให้แล้ว");
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
    runtime.selectedId = null;
    persistProject();
    render();
    return;
  }

  const visibilityId = target.closest<HTMLElement>("[data-layer-visibility]")?.dataset.layerVisibility;
  if (visibilityId) {
    transact(() => {
      const element = activePage().elements.find((item) => item.id === visibilityId);
      if (element) element.hidden = !element.hidden;
    });
    render();
    return;
  }

  const lockId = target.closest<HTMLElement>("[data-layer-lock]")?.dataset.layerLock;
  if (lockId) {
    transact(() => {
      const element = activePage().elements.find((item) => item.id === lockId);
      if (element) element.locked = !element.locked;
    });
    render();
    return;
  }

  const layerId = target.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId;
  if (layerId) {
    runtime.selectedId = layerId;
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
    void handleUploads(target.files)
      .then((count) => rerender(`เพิ่มรูป ${count} ไฟล์แล้ว`))
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : "เพิ่มรูปไม่สำเร็จ", "danger"));
    return;
  }

  if (target.matches("[data-project-name]")) {
    transact(() => {
      runtime.project.name = target.value.trim() || "Untitled Manga";
    });
    render();
    return;
  }

  const elementProp = target.dataset.elementProp;
  if (elementProp) {
    if (elementProp.startsWith("page-")) setPageProperty(elementProp, target.value);
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
    runtime.selectedId = id;
    const node = updateSelectionDom(id) ?? elementNode;
    const element = selectedElement();
    if (element) beginMove(event, element, node);
    return;
  }

  if (target.closest("[data-page-canvas]")) {
    runtime.selectedId = null;
    render();
  }
});

appRoot.addEventListener("dblclick", (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>("[data-element-id]");
  const element = activePage().elements.find((item) => item.id === node?.dataset.elementId);
  if (!element || (element.kind !== "text" && element.kind !== "bubble")) return;
  const text = window.prompt("แก้ข้อความ", element.text);
  if (text === null) return;
  transact(() => {
    element.text = text;
    runtime.selectedId = element.id;
  });
  render();
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
  if (typing) return;

  if (event.key.toLowerCase() === "v" || event.key.toLowerCase() === "h") {
    runtime.preferences.tool = event.key.toLowerCase() === "v" ? "select" : "hand";
    savePreferences();
    render();
  }
  if ((event.key === "Delete" || event.key === "Backspace") && runtime.selectedId) {
    event.preventDefault();
    deleteSelected();
    rerender("ลบองค์ประกอบแล้ว");
  }
  if (command && event.key.toLowerCase() === "d" && runtime.selectedId) {
    event.preventDefault();
    duplicateSelected();
    rerender("ทำสำเนาแล้ว");
  }

  const element = selectedElement();
  if (element && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    transact(() => {
      if (event.key === "ArrowUp") element.y -= amount;
      if (event.key === "ArrowDown") element.y += amount;
      if (event.key === "ArrowLeft") element.x -= amount;
      if (event.key === "ArrowRight") element.x += amount;
    });
    render();
  }
});

window.addEventListener("beforeunload", () => persistProject());
render();
