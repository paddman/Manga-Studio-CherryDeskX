import { uid } from "../sample";
import type { BubbleElement, MangaElement, TextStylePreset } from "../types";
import { runtime, selectedElement, transact } from "./state";

type StyledElement = Extract<MangaElement, { kind: "text" | "bubble" }>;

function isStyledElement(element: MangaElement | null): element is StyledElement {
  return element?.kind === "text" || element?.kind === "bubble";
}

function createStyle(element: StyledElement): TextStylePreset {
  const base = {
    id: uid("text-style"),
    name: `${element.kind === "bubble" ? "บอลลูน" : "ข้อความ"} ${runtime.project.textStyles.length + 1}`,
    kind: element.kind,
    fontFamily: element.fontFamily,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    color: element.color,
    align: element.align,
    lineHeight: element.lineHeight,
    letterSpacing: element.letterSpacing,
    writingMode: element.writingMode,
    outlineColor: element.outlineColor,
    outlineWidth: element.outlineWidth,
    shadowColor: element.shadowColor,
    shadowBlur: element.shadowBlur,
  } satisfies TextStylePreset;
  return element.kind === "bubble"
    ? { ...base, background: element.background, borderColor: element.borderColor, borderWidth: element.borderWidth }
    : base;
}

export function saveSelectedTextStyle(): string | null {
  const element = selectedElement();
  if (!isStyledElement(element)) return null;
  const style = createStyle(element);
  transact(() => { runtime.project.textStyles.push(style); });
  return style.id;
}

export function applyTextStylePreset(styleId: string): boolean {
  const element = selectedElement();
  const style = runtime.project.textStyles.find((candidate) => candidate.id === styleId);
  if (!isStyledElement(element) || !style || style.kind !== element.kind) return false;
  transact(() => {
    Object.assign(element, {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      align: style.align,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      writingMode: style.writingMode,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      shadowColor: style.shadowColor,
      shadowBlur: style.shadowBlur,
    });
    if (element.kind === "bubble") {
      if (style.background) element.background = style.background;
      if (style.borderColor) element.borderColor = style.borderColor;
      if (typeof style.borderWidth === "number") element.borderWidth = style.borderWidth;
    }
  });
  return true;
}

export function removeTextStylePreset(styleId: string): boolean {
  const index = runtime.project.textStyles.findIndex((style) => style.id === styleId);
  if (index < 0) return false;
  transact(() => { runtime.project.textStyles.splice(index, 1); });
  return true;
}

function selectedBubble(): BubbleElement | null {
  const element = selectedElement();
  return element?.kind === "bubble" ? element : null;
}

export function addBubbleTail(): string | null {
  const element = selectedBubble();
  if (!element) return null;
  const tail = {
    id: uid("tail"),
    x: Math.max(0, Math.min(element.width, element.width * (0.35 + (element.tails.length % 3) * 0.2))),
    y: element.height * 1.08,
  };
  transact(() => {
    element.tails.push(tail);
    element.tailX = element.tails[0]?.x ?? tail.x;
    element.tailY = element.tails[0]?.y ?? tail.y;
  });
  return tail.id;
}

export function removeBubbleTail(tailId: string): boolean {
  const element = selectedBubble();
  if (!element || !element.tails.some((tail) => tail.id === tailId)) return false;
  transact(() => {
    element.tails = element.tails.filter((tail) => tail.id !== tailId);
    element.tailX = element.tails[0]?.x ?? element.width * 0.72;
    element.tailY = element.tails[0]?.y ?? element.height * 1.08;
  });
  return true;
}
