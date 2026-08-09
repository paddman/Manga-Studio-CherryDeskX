import { createPanel } from "../sample";
import type { MangaPage, PanelElement } from "../types";

export type PanelTemplate =
  | "single"
  | "two-vertical"
  | "two-horizontal"
  | "three"
  | "four"
  | "cinema";

export function getTemplatePanels(template: string, page: MangaPage): PanelElement[] {
  const margin = 48;
  const gutter = 16;
  const width = page.width - margin * 2;
  const height = page.height - margin * 2;
  const halfW = (width - gutter) / 2;
  const halfH = (height - gutter) / 2;

  if (template === "single") return [createPanel("ช่องเต็มหน้า", margin, margin, width, height)];
  if (template === "two-vertical") {
    return [
      createPanel("ช่องซ้าย", margin, margin, halfW, height),
      createPanel("ช่องขวา", margin + halfW + gutter, margin, halfW, height),
    ];
  }
  if (template === "two-horizontal") {
    return [
      createPanel("ช่องบน", margin, margin, width, halfH),
      createPanel("ช่องล่าง", margin, margin + halfH + gutter, width, halfH),
    ];
  }
  if (template === "three") {
    const heroH = height * 0.56;
    const bottomH = height - heroH - gutter;
    return [
      createPanel("Hero", margin, margin, width, heroH),
      createPanel("ล่างซ้าย", margin, margin + heroH + gutter, halfW, bottomH),
      createPanel("ล่างขวา", margin + halfW + gutter, margin + heroH + gutter, halfW, bottomH),
    ];
  }
  if (template === "four") {
    return [
      createPanel("บนซ้าย", margin, margin, halfW, halfH),
      createPanel("บนขวา", margin + halfW + gutter, margin, halfW, halfH),
      createPanel("ล่างซ้าย", margin, margin + halfH + gutter, halfW, halfH),
      createPanel("ล่างขวา", margin + halfW + gutter, margin + halfH + gutter, halfW, halfH),
    ];
  }

  const topH = height * 0.32;
  const heroH = height - topH - gutter;
  return [
    createPanel("Establishing", margin, margin, halfW, topH),
    createPanel("Reaction", margin + halfW + gutter, margin, halfW, topH),
    createPanel("Cinematic Hero", margin, margin + topH + gutter, width, heroH),
  ];
}
