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

const JAPANESE_TEXT = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/u;
const PROHIBITED_LINE_START = new Set([...'\")}〉》」』】〕〗〙〟’”｠»、。，．・：；？！ー〜～…‥ヽヾゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ！％），．：；？］｝']);
const PROHIBITED_LINE_END = new Set([..."([{〈《「『【〔〖〘〝‘“｟«（［｛"]);

function graphemes(value: string): string[] {
  try {
    return [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(value)].map((part) => part.segment);
  } catch {
    return [...value];
  }
}

function wordSegments(value: string): string[] {
  if (JAPANESE_TEXT.test(value)) return graphemes(value);
  try {
    return [...new Intl.Segmenter("th", { granularity: "word" }).segment(value)].map((part) => part.segment);
  } catch {
    return graphemes(value);
  }
}

function measuredWidth(value: string, measure: (text: string) => number, letterSpacing: number): number {
  return measure(value) + Math.max(0, graphemeCount(value) - 1) * letterSpacing;
}

function breakOversizedSegment(segment: string, maxWidth: number, measure: (text: string) => number, letterSpacing: number): string[] {
  if (measuredWidth(segment, measure, letterSpacing) <= maxWidth) return [segment];
  const parts: string[] = [];
  let current = "";
  for (const grapheme of graphemes(segment)) {
    const candidate = `${current}${grapheme}`;
    if (current && measuredWidth(candidate, measure, letterSpacing) > maxWidth && !PROHIBITED_LINE_START.has(grapheme)) {
      parts.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Wraps Thai, Latin and Japanese text with a compact kinsoku implementation.
 * Closing punctuation never starts a line and opening punctuation is moved away
 * from the previous line end. A punctuation pair may exceed maxWidth slightly,
 * which is preferable to typographically invalid manga lettering.
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  letterSpacing = 0,
): string[] {
  const safeWidth = Math.max(1, maxWidth);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const segments = wordSegments(paragraph).flatMap((segment) => breakOversizedSegment(segment, safeWidth, measure, letterSpacing));
    let line = "";
    for (const segment of segments) {
      const candidate = `${line}${segment}`;
      if (!line || measuredWidth(candidate, measure, letterSpacing) <= safeWidth || PROHIBITED_LINE_START.has(graphemes(segment)[0] ?? "")) {
        line = candidate;
        continue;
      }
      const lineGraphemes = graphemes(line.trimEnd());
      const trailingOpeningMark = PROHIBITED_LINE_END.has(lineGraphemes.at(-1) ?? "") ? lineGraphemes.pop() ?? "" : "";
      const completedLine = lineGraphemes.join("").trimEnd();
      if (completedLine) lines.push(completedLine);
      line = `${trailingOpeningMark}${segment.trimStart()}`;
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}

function horizontalFits(input: TextFitInput, fontSize: number): boolean {
  const availableWidth = Math.max(1, input.width - input.padding * 2);
  const availableHeight = Math.max(1, input.height - input.padding * 2);
  const averageGlyphWidth = Math.max(1, fontSize * 0.56 + input.letterSpacing);
  const lines = wrapTextLines(input.text, availableWidth, (value) => graphemeCount(value) * averageGlyphWidth, 0).length;
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
