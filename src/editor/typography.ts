import type { WritingMode } from "../types";

export interface TextFitInput {
  text: string;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  writingMode: WritingMode;
  padding: number;
  minFontSize?: number;
}

function graphemeCount(value: string): number {
  try {
    return [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(value)].length;
  } catch {
    return [...value].length;
  }
}

function horizontalFits(input: TextFitInput, fontSize: number): boolean {
  const availableWidth = Math.max(1, input.width - input.padding * 2);
  const availableHeight = Math.max(1, input.height - input.padding * 2);
  const averageGlyphWidth = Math.max(1, fontSize * 0.56 + input.letterSpacing);
  const charactersPerLine = Math.max(1, Math.floor(availableWidth / averageGlyphWidth));
  const lines = input.text.split("\n").reduce((total, paragraph) => total + Math.max(1, Math.ceil(graphemeCount(paragraph) / charactersPerLine)), 0);
  return lines * fontSize * input.lineHeight <= availableHeight;
}

function verticalFits(input: TextFitInput, fontSize: number): boolean {
  const availableWidth = Math.max(1, input.width - input.padding * 2);
  const availableHeight = Math.max(1, input.height - input.padding * 2);
  const glyphStep = Math.max(1, fontSize * input.lineHeight + input.letterSpacing);
  const charactersPerColumn = Math.max(1, Math.floor(availableHeight / glyphStep));
  const columns = input.text.split("\n").reduce((total, paragraph) => total + Math.max(1, Math.ceil(graphemeCount(paragraph) / charactersPerColumn)), 0);
  return columns * fontSize * input.lineHeight <= availableWidth;
}

export function fittedFontSize(input: TextFitInput): number {
  const requested = Math.max(1, input.fontSize);
  const minimum = Math.min(requested, Math.max(1, input.minFontSize ?? 8));
  const fits = input.writingMode === "vertical" ? verticalFits : horizontalFits;
  if (fits(input, requested)) return requested;

  let low = minimum;
  let high = requested;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const candidate = (low + high) / 2;
    if (fits(input, candidate)) low = candidate;
    else high = candidate;
  }
  return Math.max(minimum, Math.floor(low * 10) / 10);
}
