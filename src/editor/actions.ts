import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  createBubble,
  createImage,
  createPanel,
  createText,
  uid,
} from "../sample";
import type {
  BubbleVariant,
  ImageElement,
  MangaAsset,
  MangaElement,
  MangaPage,
  ReadingDirection,
} from "../types";
import { activePage, runtime, selectedElement, transact } from "./state";
import { getTemplatePanels } from "./templates";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyPanelTemplate(template: string): void {
  transact(() => {
    const page = activePage();
    const content = page.elements.filter((element) => element.kind !== "panel");
    page.elements = [...getTemplatePanels(template, page), ...content];
    runtime.selectedId = null;
  });
}

export function addPanel(): void {
  transact(() => {
    const panel = createPanel("ช่องใหม่", 110, 130, 360, 320);
    activePage().elements.unshift(panel);
    runtime.selectedId = panel.id;
  });
}

export function addTextElement(title = false): void {
  transact(() => {
    const element = createText(
      title ? "CHAPTER 01\nเสียงเรียกจากความมืด" : "พิมพ์ข้อความตรงนี้",
      180,
      150,
      title ? 430 : 320,
      title ? 130 : 90,
    );
    if (title) {
      element.fontSize = 38;
      element.fontWeight = 900;
      element.color = "#ffffff";
    }
    activePage().elements.push(element);
    runtime.selectedId = element.id;
  });
}

export function addBubble(variant: BubbleVariant): void {
  transact(() => {
    const element = createBubble("พิมพ์บทพูดตรงนี้", 240, 180);
    element.variant = variant;
    if (variant === "caption") {
      element.background = "#17131f";
      element.color = "#ffffff";
      element.borderWidth = 0;
      element.height = 105;
    }
    if (variant === "shout") {
      element.fontWeight = 900;
      element.fontSize = 30;
    }
    activePage().elements.push(element);
    runtime.selectedId = element.id;
  });
}

function imageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("อ่านขนาดรูปไม่สำเร็จ"));
    image.src = src;
  });
}

async function readAsset(file: File): Promise<{ asset: MangaAsset; image: ImageElement }> {
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} ใหญ่เกิน 12 MB`);
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`));
    reader.readAsDataURL(file);
  });
  const dimensions = await imageDimensions(src);
  const ratio = Math.min(430 / dimensions.width, 430 / dimensions.height, 1);
  const width = Math.max(120, dimensions.width * ratio);
  const height = Math.max(120, dimensions.height * ratio);
  const asset: MangaAsset = {
    id: uid("asset"),
    name: file.name,
    src,
    createdAt: new Date().toISOString(),
  };
  return { asset, image: createImage(file.name, src, 120, 140, width, height) };
}

export async function handleUploads(files: FileList | null, replaceSelected = false): Promise<number> {
  if (!files?.length) return 0;
  const loaded = await Promise.all([...files].map(readAsset));
  transact(() => {
    for (const item of loaded) {
      runtime.project.assets.push(item.asset);
      const selected = selectedElement();
      if (replaceSelected && selected?.kind === "image") {
        selected.src = item.asset.src;
        selected.name = item.asset.name;
        replaceSelected = false;
      } else {
        activePage().elements.push(item.image);
        runtime.selectedId = item.image.id;
      }
    }
  });
  return loaded.length;
}

export async function addAssetToPage(assetId: string): Promise<boolean> {
  const asset = runtime.project.assets.find((item) => item.id === assetId);
  if (!asset) return false;
  const dimensions = await imageDimensions(asset.src);
  const scale = Math.min(430 / dimensions.width, 430 / dimensions.height, 1);
  transact(() => {
    const element = createImage(
      asset.name,
      asset.src,
      130,
      140,
      Math.max(120, dimensions.width * scale),
      Math.max(120, dimensions.height * scale),
    );
    activePage().elements.push(element);
    runtime.selectedId = element.id;
  });
  return true;
}

export function duplicateSelected(): void {
  const element = selectedElement();
  if (!element) return;
  transact(() => {
    const clone = structuredClone(element) as MangaElement;
    clone.id = uid(element.kind);
    clone.name = `${element.name} สำเนา`;
    clone.x += 24;
    clone.y += 24;
    activePage().elements.push(clone);
    runtime.selectedId = clone.id;
  });
}

export function deleteSelected(): void {
  if (!runtime.selectedId) return;
  transact(() => {
    const page = activePage();
    page.elements = page.elements.filter((element) => element.id !== runtime.selectedId);
    runtime.selectedId = null;
  });
}

export function moveLayer(direction: 1 | -1): void {
  if (!runtime.selectedId) return;
  transact(() => {
    const elements = activePage().elements;
    const index = elements.findIndex((element) => element.id === runtime.selectedId);
    const nextIndex = clamp(index + direction, 0, elements.length - 1);
    if (index < 0 || index === nextIndex) return;
    const [item] = elements.splice(index, 1);
    if (item) elements.splice(nextIndex, 0, item);
  });
}

export function toggleSelectedLock(): void {
  const element = selectedElement();
  if (!element) return;
  transact(() => {
    element.locked = !element.locked;
  });
}

export function addPage(): void {
  transact(() => {
    const page: MangaPage = {
      id: uid("page"),
      name: `หน้า ${runtime.project.pages.length + 1}`,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      background: "#f7f5fb",
      elements: [],
    };
    page.elements = getTemplatePanels("three", page);
    runtime.project.pages.push(page);
    runtime.project.activePageId = page.id;
    runtime.selectedId = null;
  });
}

export function duplicatePage(): void {
  const page = activePage();
  transact(() => {
    const clone = structuredClone(page);
    clone.id = uid("page");
    clone.name = `${page.name} สำเนา`;
    clone.elements = clone.elements.map((element) => ({ ...element, id: uid(element.kind) })) as MangaElement[];
    const index = runtime.project.pages.findIndex((item) => item.id === page.id);
    runtime.project.pages.splice(index + 1, 0, clone);
    runtime.project.activePageId = clone.id;
    runtime.selectedId = null;
  });
}

export function deletePage(): void {
  if (runtime.project.pages.length <= 1) return;
  transact(() => {
    const index = runtime.project.pages.findIndex((page) => page.id === runtime.project.activePageId);
    runtime.project.pages.splice(index, 1);
    runtime.project.activePageId = runtime.project.pages[Math.max(0, index - 1)]!.id;
    runtime.selectedId = null;
  });
}

export function smartLayout(): void {
  transact(() => {
    const page = activePage();
    const images = page.elements.filter((element): element is ImageElement => element.kind === "image");
    const content = page.elements.filter((element) => element.kind !== "panel");
    const template = images.length <= 1 ? "single" : images.length === 2 ? "two-horizontal" : images.length <= 3 ? "three" : "four";
    const panels = getTemplatePanels(template, page);
    page.elements = [...panels, ...content];
    images.slice(0, panels.length).forEach((image, index) => {
      const panel = panels[index];
      if (!panel) return;
      image.x = panel.x + panel.borderWidth;
      image.y = panel.y + panel.borderWidth;
      image.width = panel.width - panel.borderWidth * 2;
      image.height = panel.height - panel.borderWidth * 2;
      image.rotation = 0;
      image.fit = "cover";
    });
    runtime.selectedId = null;
  });
}

export function setSelectedProperty(prop: string, rawValue: string | boolean): void {
  const element = selectedElement();
  if (!element) return;
  transact(() => {
    const record = element as unknown as Record<string, unknown>;
    if (prop === "opacity-percent") {
      element.opacity = clamp(Number(rawValue) / 100, 0, 1);
      return;
    }
    const numericProps = new Set([
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "borderWidth",
      "borderRadius",
      "grayscale",
      "contrast",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "tailX",
      "tailY",
    ]);
    record[prop] = numericProps.has(prop) ? Number(rawValue) : rawValue;
    element.width = Math.max(10, element.width);
    element.height = Math.max(10, element.height);
  });
}

export function setPageProperty(prop: string, rawValue: string): void {
  transact(() => {
    const page = activePage();
    if (prop === "page-name") page.name = rawValue;
    if (prop === "page-width") page.width = clamp(Number(rawValue), 320, 3000);
    if (prop === "page-height") page.height = clamp(Number(rawValue), 320, 5000);
    if (prop === "page-background") page.background = rawValue;
  });
}

export function setProjectProperty(prop: string, rawValue: string): void {
  transact(() => {
    if (prop === "readingDirection") runtime.project.readingDirection = rawValue as ReadingDirection;
  });
}

export function addQuickPanel(): void {
  transact(() => {
    const panel = createPanel("ช่องใหม่", 140, 160, 360, 300);
    activePage().elements.unshift(panel);
    runtime.selectedId = panel.id;
  });
}
