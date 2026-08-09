import { clamp, getCropRect, setCropRect } from "../editor/actions";
import { rotatedViewportSize } from "../editor/interactions";
import { activePage, checkpoint, persistProject, runtime, savePreferences, selectedElements } from "../editor/state";
import { geometryBounds, rotateGeometries, scaleGeometries } from "../editor/transforms";
import type { ImageElement, MangaElement, RasterPoint } from "../types";

export interface GestureHost {
  pagePoint(event: PointerEvent): RasterPoint;
  render(): void;
  rerender(message?: string): void;
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
  startPageX: number;
  startPageY: number;
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
      // A render may detach the pointer target before pointerup.
    }
  };
}

export function pagePosition(element: MangaElement): { x: number; y: number } {
  if (!element.parentId) return { x: element.x, y: element.y };
  const parent = activePage().elements.find((candidate) => candidate.id === element.parentId);
  return parent ? { x: parent.x + element.x, y: parent.y + element.y } : { x: element.x, y: element.y };
}

function setPagePosition(element: MangaElement, x: number, y: number): void {
  if (!element.parentId) {
    element.x = x;
    element.y = y;
    return;
  }
  const parent = activePage().elements.find((candidate) => candidate.id === element.parentId);
  element.x = parent ? x - parent.x : x;
  element.y = parent ? y - parent.y : y;
}

function selectedTransformRoots(): MangaElement[] {
  const selected = selectedElements().filter((element) => !element.locked);
  const selectedIds = new Set(selected.map((element) => element.id));
  return selected.filter((element) => !element.parentId || !selectedIds.has(element.parentId));
}

function selectedResizeTargets(roots: readonly MangaElement[]): MangaElement[] {
  const ids = new Set(roots.map((element) => element.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of activePage().elements) {
      if (!element.parentId || !ids.has(element.parentId) || ids.has(element.id)) continue;
      ids.add(element.id);
      changed = true;
    }
  }
  return activePage().elements.filter((element) => ids.has(element.id) && !element.locked);
}

function elementTransformStyle(element: MangaElement): string {
  return `rotate(${element.rotation}deg) skew(${element.skewX}deg,${element.skewY}deg) scale(${element.flipX ? -1 : 1},${element.flipY ? -1 : 1})`;
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
  const xCandidates = [0, page.width / 2, page.width, ...page.elements.filter((element) => !selectedIds.has(element.id)).flatMap((element) => {
    const position = pagePosition(element);
    return [position.x, position.x + element.width / 2, position.x + element.width];
  })];
  const yCandidates = [0, page.height / 2, page.height, ...page.elements.filter((element) => !selectedIds.has(element.id)).flatMap((element) => {
    const position = pagePosition(element);
    return [position.y, position.y + element.height / 2, position.y + element.height];
  })];
  const xTargets = [minX, (minX + maxX) / 2, maxX];
  const yTargets = [minY, (minY + maxY) / 2, maxY];
  const nearest = (targets: number[], candidate: number): { correction: number; position: number } | null => {
    let best: { correction: number; position: number } | null = null;
    for (const target of targets) {
      const correction = candidate - target;
      if (Math.abs(correction) > 8 || (best && Math.abs(correction) >= Math.abs(best.correction))) continue;
      best = { correction, position: candidate };
    }
    return best;
  };
  const xSnap = xCandidates.map((candidate) => nearest(xTargets, candidate)).filter((value): value is { correction: number; position: number } => value !== null).sort((a, b) => Math.abs(a.correction) - Math.abs(b.correction))[0];
  const ySnap = yCandidates.map((candidate) => nearest(yTargets, candidate)).filter((value): value is { correction: number; position: number } => value !== null).sort((a, b) => Math.abs(a.correction) - Math.abs(b.correction))[0];
  runtime.selectionGuides = [];
  if (xSnap) {
    boxes.forEach(({ element }) => { element.x += xSnap.correction; });
    runtime.selectionGuides.push({ axis: "x", position: xSnap.position, label: `${Math.round(xSnap.position)} px` });
  }
  if (ySnap) {
    boxes.forEach(({ element }) => { element.y += ySnap.correction; });
    runtime.selectionGuides.push({ axis: "y", position: ySnap.position, label: `${Math.round(ySnap.position)} px` });
  }
}

export interface GestureController {
  beginMove(event: PointerEvent, element: MangaElement, node: HTMLElement): void;
  beginCropMove(event: PointerEvent, element: ImageElement, node: HTMLElement): void;
  beginCropResize(event: PointerEvent, element: ImageElement, node: HTMLElement, handle: string): void;
  beginResize(event: PointerEvent, element: MangaElement, node: HTMLElement, handle: string): void;
  beginRotate(event: PointerEvent, element: MangaElement, node: HTMLElement): void;
  beginPan(event: PointerEvent): void;
  beginCanvasRotation(event: PointerEvent): void;
  moveNavigatorTo(event: PointerEvent, map: HTMLElement): void;
}

export function createGestureController(host: GestureHost): GestureController {
  const beginCropMove = (event: PointerEvent, element: ImageElement, _node: HTMLElement): void => {
    const releasePointer = capturePointer(event);
    checkpoint();
    const start = getCropRect(element);
    const startPointer = host.pagePoint(event);
    const move = (moveEvent: PointerEvent): void => {
      const currentPointer = host.pagePoint(moveEvent);
      const dx = (currentPointer.x - startPointer.x) / Math.max(1, element.width);
      const dy = (currentPointer.y - startPointer.y) / Math.max(1, element.height);
      setCropRect(element, { ...start, left: start.left + dx, top: start.top + dy });
    };
    const end = (): void => {
      window.removeEventListener("pointermove", move);
      releasePointer();
      persistProject();
      host.rerender("ปรับ Crop แล้ว");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginCropResize = (event: PointerEvent, element: ImageElement, _node: HTMLElement, handle: string): void => {
    const releasePointer = capturePointer(event);
    checkpoint();
    const start = getCropRect(element);
    const startPointer = host.pagePoint(event);
    const startRight = start.left + start.width;
    const startBottom = start.top + start.height;
    const move = (moveEvent: PointerEvent): void => {
      const currentPointer = host.pagePoint(moveEvent);
      const dx = (currentPointer.x - startPointer.x) / Math.max(1, element.width);
      const dy = (currentPointer.y - startPointer.y) / Math.max(1, element.height);
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
      host.rerender("เลือกพื้นที่ Crop แล้ว");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginMove = (event: PointerEvent, element: MangaElement, node: HTMLElement): void => {
    const tool = runtime.preferences.tool as string;
    if (element.locked || (tool !== "select" && tool !== "free-transform")) return;
    if (runtime.preferences.cropElementId === element.id && element.kind === "image") {
      beginCropMove(event, element, node);
      return;
    }
    const elements = selectedTransformRoots();
    const releasePointer = capturePointer(event);
    checkpoint();
    const startPoint = host.pagePoint(event);
    const context: DragContext = {
      items: elements.map((candidate) => ({ element: candidate, node: document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(candidate.id)}"]`) ?? node, startX: candidate.x, startY: candidate.y, startWidth: candidate.width, startHeight: candidate.height })),
      startPageX: startPoint.x,
      startPageY: startPoint.y,
    };
    const move = (moveEvent: PointerEvent): void => {
      const currentPoint = host.pagePoint(moveEvent);
      const dx = currentPoint.x - context.startPageX;
      const dy = currentPoint.y - context.startPageY;
      const page = activePage();
      context.items.forEach((item) => {
        const parent = item.element.parentId ? page.elements.find((candidate) => candidate.id === item.element.parentId) : null;
        const minX = parent ? 0 : -item.element.width + 24;
        const maxX = parent?.kind === "panel" ? parent.width - 24 : page.width - 24;
        const minY = parent ? 0 : -item.element.height + 24;
        const maxY = parent?.kind === "panel" ? parent.height - 24 : page.height - 24;
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
      host.rerender();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginResize = (event: PointerEvent, element: MangaElement, node: HTMLElement, handle: string): void => {
    if (element.locked) return;
    const releasePointer = capturePointer(event);
    checkpoint();
    const roots = selectedTransformRoots();
    const selectedRoots = roots.some((candidate) => candidate.id === element.id) ? roots : [element];
    const rootBoxes = selectedRoots.map((candidate) => {
      const position = pagePosition(candidate);
      return { id: candidate.id, x: position.x, y: position.y, width: candidate.width, height: candidate.height, rotation: candidate.rotation };
    });
    const bounds = geometryBounds(rootBoxes);
    if (!bounds) return;
    const targets = selectedResizeTargets(selectedRoots).map((candidate) => {
      const position = pagePosition(candidate);
      return { element: candidate, node: document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(candidate.id)}"]`) ?? node, pageX: position.x, pageY: position.y, width: candidate.width, height: candidate.height };
    });
    const ratio = bounds.width / bounds.height;
    const startPointer = host.pagePoint(event);
    const move = (moveEvent: PointerEvent): void => {
      const currentPointer = host.pagePoint(moveEvent);
      const dx = currentPointer.x - startPointer.x;
      const dy = currentPointer.y - startPointer.y;
      let { x, y, width, height } = bounds;
      if (handle.includes("e")) width = bounds.width + dx;
      if (handle.includes("s")) height = bounds.height + dy;
      if (handle.includes("w")) { width = bounds.width - dx; x = bounds.x + dx; }
      if (handle.includes("n")) { height = bounds.height - dy; y = bounds.y + dy; }
      if ((selectedRoots.some((candidate) => candidate.lockAspect) || moveEvent.shiftKey) && handle.length === 2) {
        if (Math.abs(dx) > Math.abs(dy)) height = width / ratio;
        else width = height * ratio;
        if (handle.includes("w")) x = bounds.x + bounds.width - width;
        if (handle.includes("n")) y = bounds.y + bounds.height - height;
      }
      if (width < 24) { if (handle.includes("w")) x -= 24 - width; width = 24; }
      if (height < 24) { if (handle.includes("n")) y -= 24 - height; height = 24; }
      const scaled = scaleGeometries(targets.map((item) => ({ id: item.element.id, x: item.pageX, y: item.pageY, width: item.width, height: item.height, rotation: item.element.rotation })), bounds, { x, y, width, height });
      const scaledById = new Map(scaled.map((geometry) => [geometry.id, geometry]));
      targets.map((item) => ({ item, geometry: scaledById.get(item.element.id) })).filter((value): value is { item: typeof targets[number]; geometry: NonNullable<typeof value.geometry> } => Boolean(value.geometry)).sort((a, b) => Number(Boolean(a.item.element.parentId)) - Number(Boolean(b.item.element.parentId))).forEach(({ item, geometry }) => {
        setPagePosition(item.element, geometry.x, geometry.y);
        item.element.width = geometry.width;
        item.element.height = geometry.height;
        Object.assign(item.node.style, { left: `${item.element.x}px`, top: `${item.element.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
      });
    };
    const end = (): void => {
      window.removeEventListener("pointermove", move);
      releasePointer();
      persistProject();
      host.rerender();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginRotate = (event: PointerEvent, element: MangaElement, node: HTMLElement): void => {
    if (element.locked) return;
    const releasePointer = capturePointer(event);
    checkpoint();
    const roots = selectedTransformRoots();
    const selectedRoots = roots.some((candidate) => candidate.id === element.id) ? roots : [element];
    const items = selectedRoots.map((candidate) => {
      const position = pagePosition(candidate);
      return { element: candidate, node: document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(candidate.id)}"]`) ?? node, x: position.x, y: position.y, rotation: candidate.rotation };
    });
    const bounds = geometryBounds(items.map((item) => ({ id: item.element.id, x: item.x, y: item.y, width: item.element.width, height: item.element.height, rotation: item.rotation })));
    if (!bounds) return;
    const centerPageX = bounds.x + bounds.width / 2;
    const centerPageY = bounds.y + bounds.height / 2;
    const canvas = document.querySelector<HTMLElement>("[data-page-canvas]");
    const canvasRect = canvas?.getBoundingClientRect();
    const canvasRadians = runtime.preferences.canvasRotation * Math.PI / 180;
    const canvasDx = centerPageX - activePage().width / 2;
    const canvasDy = centerPageY - activePage().height / 2;
    const nodeRect = node.getBoundingClientRect();
    const centerX = canvasRect ? canvasRect.left + canvasRect.width / 2 + (canvasDx * Math.cos(canvasRadians) - canvasDy * Math.sin(canvasRadians)) * runtime.preferences.zoom : nodeRect.left + nodeRect.width / 2;
    const centerY = canvasRect ? canvasRect.top + canvasRect.height / 2 + (canvasDx * Math.sin(canvasRadians) + canvasDy * Math.cos(canvasRadians)) * runtime.preferences.zoom : nodeRect.top + nodeRect.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const move = (moveEvent: PointerEvent): void => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let deltaDegrees = ((angle - startAngle) * 180) / Math.PI;
      if (moveEvent.shiftKey) deltaDegrees = Math.round(deltaDegrees / 15) * 15;
      const rotated = rotateGeometries(items.map((item) => ({ id: item.element.id, x: item.x, y: item.y, width: item.element.width, height: item.element.height, rotation: item.rotation })), { x: centerPageX, y: centerPageY }, deltaDegrees);
      const rotatedById = new Map(rotated.map((geometry) => [geometry.id, geometry]));
      items.forEach((item) => {
        const geometry = rotatedById.get(item.element.id);
        if (!geometry) return;
        setPagePosition(item.element, geometry.x, geometry.y);
        item.element.rotation = geometry.rotation;
        item.node.style.left = `${item.element.x}px`;
        item.node.style.top = `${item.element.y}px`;
        item.node.style.transform = elementTransformStyle(item.element);
      });
    };
    const end = (): void => {
      window.removeEventListener("pointermove", move);
      releasePointer();
      persistProject();
      host.rerender();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginPan = (event: PointerEvent): void => {
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
    const end = (): void => { window.removeEventListener("pointermove", move); releasePointer(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const beginCanvasRotation = (event: PointerEvent): void => {
    const releasePointer = capturePointer(event);
    const startX = event.clientX;
    const startRotation = runtime.preferences.canvasRotation;
    const canvas = document.querySelector<HTMLElement>("[data-page-canvas]");
    const sizer = canvas?.closest<HTMLElement>(".canvas-sizer");
    const move = (moveEvent: PointerEvent): void => {
      let rotation = startRotation + (moveEvent.clientX - startX) * 0.35;
      if (moveEvent.shiftKey) rotation = Math.round(rotation / 15) * 15;
      runtime.preferences.canvasRotation = clamp(rotation, -180, 180);
      if (canvas) canvas.style.transform = `translate(-50%,-50%) rotate(${runtime.preferences.canvasRotation}deg) scale(${runtime.preferences.zoom})`;
      if (sizer) {
        const size = rotatedViewportSize(activePage().width, activePage().height, runtime.preferences.zoom, runtime.preferences.canvasRotation);
        sizer.style.width = `${Math.ceil(size.width)}px`;
        sizer.style.height = `${Math.ceil(size.height)}px`;
      }
    };
    const end = (): void => { window.removeEventListener("pointermove", move); releasePointer(); savePreferences(); host.render(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const moveNavigatorTo = (event: PointerEvent, map: HTMLElement): void => {
    const viewport = document.querySelector<HTMLElement>("[data-stage-viewport]");
    if (!viewport) return;
    const rect = map.getBoundingClientRect();
    const ratioX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const ratioY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    viewport.scrollLeft = ratioX * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = ratioY * viewport.scrollHeight - viewport.clientHeight / 2;
  };

  return { beginMove, beginCropMove, beginCropResize, beginResize, beginRotate, beginPan, beginCanvasRotation, moveNavigatorTo };
}
