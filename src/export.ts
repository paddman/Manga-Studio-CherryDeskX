import type {
  BubbleElement,
  ImageElement,
  MangaElement,
  MangaPage,
  TextAlign,
  TextElement,
  MangaProject,
  ExportFormat as ProjectExportFormat,
  ExportScaleMode,
  ExportScope as ProjectExportScope,
} from "./types";
import { renderRasterLayer } from "./editor/raster";
import { isRasterLayer, orderedPageLayers } from "./editor/layers";
import { fittedFontSize, wrapTextLines } from "./editor/typography";

export type ExportFormat = ProjectExportFormat;
export type ExportScope = ProjectExportScope;

export interface ExportOptions {
  format: ExportFormat;
  scope?: ExportScope;
  scale?: number;
  maxWebtoonHeight?: number;
  backgroundColor?: string | null;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  includeBleed?: boolean;
  cropMarks?: boolean;
}

export interface PrintLayoutOptions {
  bleedMm: number;
  dpi: number;
  includeBleed: boolean;
  cropMarks: boolean;
}

export function exportScaleForMode(mode: ExportScaleMode, customScale: number, documentDpi: number): number {
  if (mode === "1x") return 1;
  if (mode === "2x") return 2;
  if (mode === "300dpi") return Math.max(0.25, 300 / Math.max(72, documentDpi));
  return Math.max(0.25, Math.min(8, customScale));
}

export function millimetersToPixels(millimeters: number, dpi: number): number {
  return Math.max(0, millimeters) * Math.max(72, dpi) / 25.4;
}

function logicalRenderInsets(layout: PrintLayoutOptions | undefined): { bleed: number; marks: number; inset: number } {
  const bleed = layout?.includeBleed ? millimetersToPixels(layout.bleedMm, layout.dpi) : 0;
  const marks = layout?.cropMarks ? Math.max(18, layout.dpi / 10) : 0;
  return { bleed, marks, inset: bleed + marks };
}

export function renderedPagePixelSize(page: MangaPage, scale: number, layout?: PrintLayoutOptions): { width: number; height: number } {
  const { inset } = logicalRenderInsets(layout);
  return {
    width: Math.max(1, Math.round((page.width + inset * 2) * scale)),
    height: Math.max(1, Math.round((page.height + inset * 2) * scale)),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("โหลดภาพสำหรับส่งออกไม่สำเร็จ"));
    image.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  element: ImageElement,
): void {
  const { width, height, fit } = element;
  const crop = element.crop;
  const cropLeft = crop.left ?? 0;
  const cropTop = crop.top ?? 0;
  const cropWidth = crop.width ?? 1;
  const cropHeight = crop.height ?? 1;
  const hasSelection = cropLeft > 0.001 || cropTop > 0.001 || cropWidth < 0.999 || cropHeight < 0.999;
  if (hasSelection) {
    ctx.drawImage(
      image,
      image.naturalWidth * cropLeft,
      image.naturalHeight * cropTop,
      image.naturalWidth * cropWidth,
      image.naturalHeight * cropHeight,
      0,
      0,
      width,
      height,
    );
    return;
  }
  if (fit === "stretch") {
    const scaledWidth = width * element.crop.scale;
    const scaledHeight = height * element.crop.scale;
    ctx.drawImage(image, (width - scaledWidth) * element.crop.x, (height - scaledHeight) * element.crop.y, scaledWidth, scaledHeight);
    return;
  }

  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let x = 0;
  let y = 0;

  if ((fit === "cover" && sourceRatio > targetRatio) || (fit === "contain" && sourceRatio < targetRatio)) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    x = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    y = (height - drawHeight) / 2;
  }

  const scaledWidth = drawWidth * element.crop.scale;
  const scaledHeight = drawHeight * element.crop.scale;
  const cropX = (width - scaledWidth) * element.crop.x;
  const cropY = (height - scaledHeight) * element.crop.y;
  ctx.drawImage(image, x + cropX, y + cropY, scaledWidth, scaledHeight);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  letterSpacing = 0,
): string[] {
  return wrapTextLines(text, maxWidth, (value) => ctx.measureText(value).width, letterSpacing);
}

function drawTextLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, letterSpacing: number, outlineWidth: number): void {
  if (!letterSpacing) {
    if (outlineWidth > 0) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    return;
  }
  const graphemes = [...line];
  const widths = graphemes.map((grapheme) => ctx.measureText(grapheme).width);
  const totalWidth = widths.reduce((total, width) => total + width, 0) + Math.max(0, graphemes.length - 1) * letterSpacing;
  let cursor = ctx.textAlign === "center" ? x - totalWidth / 2 : ctx.textAlign === "right" ? x - totalWidth : x;
  const previousAlign = ctx.textAlign;
  ctx.textAlign = "left";
  graphemes.forEach((grapheme, index) => {
    if (outlineWidth > 0) ctx.strokeText(grapheme, cursor, y);
    ctx.fillText(grapheme, cursor, y);
    cursor += (widths[index] ?? 0) + letterSpacing;
  });
  ctx.textAlign = previousAlign;
}

function alignX(align: TextAlign, width: number, padding: number): number {
  if (align === "left") return padding;
  if (align === "right") return width - padding;
  return width / 2;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  options: {
    text: string;
    width: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    color: string;
    align: TextAlign;
    lineHeight: number;
    padding: number;
    letterSpacing?: number;
    verticalCenter?: boolean;
    writingMode?: "horizontal" | "vertical";
    outlineColor?: string;
    outlineWidth?: number;
    shadowColor?: string;
    shadowBlur?: number;
  },
): void {
  const {
    text,
    width,
    height,
    fontSize,
    fontWeight,
    fontFamily,
    color,
    align,
    lineHeight,
    padding,
    verticalCenter = false,
    writingMode = "horizontal",
    outlineColor = "transparent",
    outlineWidth = 0,
    shadowColor = "transparent",
    shadowBlur = 0,
    letterSpacing = 0,
  } = options;

  ctx.fillStyle = color;
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineWidth * 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  if (writingMode === "vertical") {
    const columns = text.split("\n");
    const step = fontSize * lineHeight + letterSpacing;
    let x = width - padding - fontSize / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const column of columns) {
      let y = padding;
      for (const character of [...column]) {
        if (outlineWidth > 0) ctx.strokeText(character, x, y);
        ctx.fillText(character, x, y);
        y += step;
        if (y > height - padding) {
          x -= step;
          y = padding;
        }
      }
      x -= step;
      if (x < padding) break;
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    return;
  }
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, text, Math.max(12, width - padding * 2), letterSpacing);
  const step = fontSize * lineHeight;
  const totalHeight = lines.length * step;
  let y = verticalCenter ? Math.max(padding, (height - totalHeight) / 2) : padding;
  const x = alignX(align, width, padding);

  for (const line of lines) {
    drawTextLine(ctx, line, x, y, letterSpacing, outlineWidth);
    y += step;
    if (y > height - padding) break;
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function drawTextElement(ctx: CanvasRenderingContext2D, element: TextElement): void {
  const fontSize = element.autoFit ? fittedFontSize({ ...element, padding: 4 }) : element.fontSize;
  drawTextBlock(ctx, {
    text: element.text,
    width: element.width,
    height: element.height,
    fontSize,
    fontWeight: element.fontWeight,
    fontFamily: element.fontFamily,
    color: element.color,
    align: element.align,
    lineHeight: element.lineHeight,
    padding: 4,
    letterSpacing: element.letterSpacing,
    writingMode: element.writingMode,
    outlineColor: element.outlineColor,
    outlineWidth: element.outlineWidth,
    shadowColor: element.shadowColor,
    shadowBlur: element.shadowBlur,
  });
}

function drawShoutShape(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const points = 18;
  const centerX = width / 2;
  const centerY = height / 2;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
    const outer = i % 2 === 0;
    const radiusX = outer ? width / 2 : width * 0.42;
    const radiusY = outer ? height / 2 : height * 0.42;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawBubbleElement(ctx: CanvasRenderingContext2D, element: BubbleElement): void {
  const { width, height, variant, borderWidth } = element;
  ctx.fillStyle = element.background;
  ctx.strokeStyle = element.borderColor;
  ctx.lineWidth = borderWidth;
  ctx.lineJoin = "round";
  ctx.setLineDash(variant === "whisper" ? [Math.max(4, borderWidth * 2), Math.max(3, borderWidth)] : []);

  if (variant === "shout") {
    drawShoutShape(ctx, width, height);
    ctx.fill();
    if (borderWidth > 0) ctx.stroke();
  } else if (variant === "caption" || variant === "narration") {
    roundedRect(ctx, 0, 0, width, height, 10);
    ctx.fill();
    if (borderWidth > 0) ctx.stroke();
  } else {
    roundedRect(ctx, 0, 0, width, height * 0.82, Math.min(36, height * 0.26));
    ctx.fill();
    if (borderWidth > 0) ctx.stroke();

    if (variant === "thought") {
      ctx.beginPath();
      ctx.arc(width * 0.7, height * 0.82, Math.max(6, height * 0.06), 0, Math.PI * 2);
      ctx.arc(width * 0.78, height * 0.91, Math.max(4, height * 0.04), 0, Math.PI * 2);
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
    }
  }

  if (variant === "speech" || variant === "whisper" || variant === "shout") {
    for (const tail of element.tails) {
      ctx.beginPath();
      ctx.moveTo(width * 0.64, height * 0.76);
      ctx.lineTo(Math.min(width, Math.max(0, tail.x)), Math.min(height * 1.6, Math.max(0, tail.y)));
      ctx.lineTo(width * 0.78, height * 0.73);
      ctx.closePath();
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  const textHeight = variant === "caption" || variant === "narration" ? height : height * 0.82;
  const padding = Math.max(12, element.fontSize * 0.65);
  const fontSize = element.autoFit ? fittedFontSize({ ...element, height: textHeight, padding }) : element.fontSize;
  drawTextBlock(ctx, {
    text: element.text,
    width,
    height: textHeight,
    fontSize,
    fontWeight: element.fontWeight,
    fontFamily: element.fontFamily,
    color: element.color,
    align: element.align,
    lineHeight: element.lineHeight,
    padding,
    letterSpacing: element.letterSpacing,
    verticalCenter: true,
    writingMode: element.writingMode,
    outlineColor: element.outlineColor,
    outlineWidth: element.outlineWidth,
    shadowColor: element.shadowColor,
    shadowBlur: element.shadowBlur,
  });
}

async function drawElement(ctx: CanvasRenderingContext2D, element: MangaElement, page: MangaPage): Promise<void> {
  if (element.hidden) return;

  if (element.parentId && element.kind !== "image") return;
  if (element.kind === "image" && element.parentId) {
    const panel = page.elements.find((candidate) => candidate.id === element.parentId && candidate.kind === "panel");
    if (!panel || panel.kind !== "panel") return;
    ctx.save();
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, panel.borderRadius);
    ctx.clip();
    ctx.translate(panel.x, panel.y);
    await drawElement(ctx, { ...element, parentId: undefined }, page);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = element.opacity;
  ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
  ctx.rotate((element.rotation * Math.PI) / 180);
  ctx.transform(1, Math.tan(element.skewY * Math.PI / 180), Math.tan(element.skewX * Math.PI / 180), 1, 0, 0);
  ctx.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1);
  ctx.translate(-element.width / 2, -element.height / 2);

  if (element.kind === "panel") {
    roundedRect(ctx, 0, 0, element.width, element.height, element.borderRadius);
    ctx.fillStyle = element.background;
    ctx.fill();
    if (element.borderWidth > 0) {
      ctx.strokeStyle = element.borderColor;
      ctx.lineWidth = element.borderWidth;
      ctx.stroke();
    }
    ctx.save();
    roundedRect(ctx, 0, 0, element.width, element.height, element.borderRadius);
    ctx.clip();
    for (const child of page.elements.filter((candidate) => candidate.parentId === element.id)) {
      await drawElement(ctx, { ...child, parentId: undefined }, page);
    }
    ctx.restore();
  }

  if (element.kind === "image") {
    roundedRect(ctx, 0, 0, element.width, element.height, element.borderRadius);
    ctx.clip();
    const image = await loadImage(element.src);
    ctx.filter = `grayscale(${element.grayscale}%) contrast(${element.contrast}%)`;
    drawFittedImage(ctx, image, element);
    ctx.filter = "none";
  }

  if (element.kind === "text") drawTextElement(ctx, element);
  if (element.kind === "bubble") drawBubbleElement(ctx, element);
  ctx.restore();
}

function drawCropMarks(ctx: CanvasRenderingContext2D, page: MangaPage, layout: PrintLayoutOptions, inset: number): void {
  if (!layout.cropMarks) return;
  const bleed = layout.includeBleed ? millimetersToPixels(layout.bleedMm, layout.dpi) : 0;
  const gap = Math.max(3, layout.dpi / 100);
  const length = Math.max(12, layout.dpi / 18);
  const left = inset;
  const top = inset;
  const right = left + page.width;
  const bottom = top + page.height;
  const outerLeft = left - bleed - gap;
  const outerTop = top - bleed - gap;
  const outerRight = right + bleed + gap;
  const outerBottom = bottom + bleed + gap;
  ctx.save();
  ctx.strokeStyle = "#111111";
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(0.5, 96 / Math.max(96, layout.dpi));
  ctx.beginPath();
  ctx.moveTo(outerLeft - length, top); ctx.lineTo(outerLeft, top);
  ctx.moveTo(left, outerTop - length); ctx.lineTo(left, outerTop);
  ctx.moveTo(outerRight, top); ctx.lineTo(outerRight + length, top);
  ctx.moveTo(right, outerTop - length); ctx.lineTo(right, outerTop);
  ctx.moveTo(outerLeft - length, bottom); ctx.lineTo(outerLeft, bottom);
  ctx.moveTo(left, outerBottom); ctx.lineTo(left, outerBottom + length);
  ctx.moveTo(outerRight, bottom); ctx.lineTo(outerRight + length, bottom);
  ctx.moveTo(right, outerBottom); ctx.lineTo(right, outerBottom + length);
  ctx.stroke();
  ctx.restore();
}

export async function renderPageBlob(
  page: MangaPage,
  scale = 2,
  mimeType: "image/png" | "image/jpeg" = "image/png",
  signal?: AbortSignal,
  backgroundColor: string | null | undefined = undefined,
  printLayout?: PrintLayoutOptions,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const outputSize = renderedPagePixelSize(page, scale, printLayout);
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");

  ctx.scale(scale, scale);
  const { inset } = logicalRenderInsets(printLayout);
  const effectiveBackground = backgroundColor === undefined ? page.background : backgroundColor;
  if (effectiveBackground !== null) {
    ctx.fillStyle = effectiveBackground;
    ctx.fillRect(0, 0, outputSize.width / scale, outputSize.height / scale);
  }

  ctx.save();
  ctx.translate(inset, inset);
  for (const layer of orderedPageLayers(page)) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    if (isRasterLayer(layer)) {
      if (layer.hidden) continue;
      const rasterCanvas = document.createElement("canvas");
      renderRasterLayer(rasterCanvas, page, layer);
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(rasterCanvas, 0, 0, page.width, page.height);
      ctx.restore();
      continue;
    }
    if (!layer.parentId) await drawElement(ctx, layer, page);
  }
  ctx.restore();
  if (printLayout) drawCropMarks(ctx, page, printLayout, inset);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error(`สร้างไฟล์ ${mimeType === "image/png" ? "PNG" : "JPG"} ไม่สำเร็จ`));
    }, mimeType, mimeType === "image/jpeg" ? 0.92 : undefined);
  });
}

function safeFilename(filename: string): string {
  return filename
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "manga-export";
}

export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportPagePng(page: MangaPage, filename: string, scale = 2): Promise<void> {
  const blob = await renderPageBlob(page, scale, "image/png");
  downloadBlobFile(blob, `${safeFilename(filename)}.png`);
}

interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function createStoreZip(entries: ArchiveEntry[]): Blob {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const header = concatBytes([
      Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
      writeUint16(20), writeUint16(0), writeUint16(0), writeUint16(0), writeUint16(0),
      writeUint32(checksum), writeUint32(entry.data.length), writeUint32(entry.data.length),
      writeUint16(name.length), writeUint16(0), name, entry.data,
    ]);
    local.push(header);
    const centralHeader = concatBytes([
      Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
      writeUint16(20), writeUint16(20), writeUint16(0), writeUint16(0), writeUint16(0), writeUint16(0),
      writeUint32(checksum), writeUint32(entry.data.length), writeUint32(entry.data.length),
      writeUint16(name.length), writeUint16(0), writeUint16(0), writeUint16(0), writeUint16(0), writeUint32(0), writeUint32(offset), name,
    ]);
    central.push(centralHeader);
    offset += header.length;
  }
  const centralData = concatBytes(central);
  const localData = concatBytes(local);
  const end = concatBytes([
    Uint8Array.of(0x50, 0x4b, 0x05, 0x06), writeUint16(0), writeUint16(0), writeUint16(entries.length), writeUint16(entries.length), writeUint32(centralData.length), writeUint32(localData.length), writeUint16(0),
  ]);
  return new Blob([localData, centralData, end], { type: "application/zip" });
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export async function createPdfDocument(pages: Array<{ page: MangaPage; blob: Blob; width: number; height: number; dpi?: number }>): Promise<Blob> {
  const objects: Uint8Array[] = [];
  const pageReferences: number[] = [];
  const pagesObject = 2;
  objects.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.push(new Uint8Array());
  for (const item of pages) {
    const image = new Uint8Array(await item.blob.arrayBuffer());
    const pageObject = objects.length + 1;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    pageReferences.push(pageObject);
    const outputDpi = Math.max(72, item.dpi ?? 96);
    const pdfWidth = Math.round(item.width * 72 / outputDpi);
    const pdfHeight = Math.round(item.height * 72 / outputDpi);
    objects.push(ascii(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`));
    const stream = `q ${pdfWidth} 0 0 ${pdfHeight} 0 0 cm /Im0 Do Q`;
    objects.push(ascii(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    objects.push(concatBytes([ascii(`<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, ascii("\nendstream")]));
  }
  objects[1] = ascii(`<< /Type /Pages /Kids [${pageReferences.map((reference) => `${reference} 0 R`).join(" ")}] /Count ${pageReferences.length} >>`);
  const chunks: Uint8Array[] = [ascii("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  const offsets: number[] = [0];
  let cursor = chunks[0]!.length;
  objects.forEach((object, index) => {
    offsets[index + 1] = cursor;
    const wrapped = concatBytes([ascii(`${index + 1} 0 obj\n`), object, ascii("\nendobj\n")]);
    chunks.push(wrapped);
    cursor += wrapped.length;
  });
  const xrefOffset = cursor;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(ascii(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob(chunks, { type: "application/pdf" });
}

export function pagesForScope(project: MangaProject, scope: ExportScope): MangaPage[] {
  const byId = new Map(project.pages.map((page) => [page.id, page]));
  const resolve = (ids: readonly string[]): MangaPage[] => ids.map((id) => byId.get(id)).filter((page): page is MangaPage => page !== undefined);
  if (scope === "page") {
    const active = project.pages.find((page) => page.id === project.activePageId) ?? project.pages[0];
    return active ? [active] : [];
  }
  if (scope === "chapter") {
    const chapter = project.chapters.find((item) => item.id === project.activeChapterId);
    return resolve(chapter?.pageIds ?? []);
  }
  if (scope === "volume") {
    const volume = project.volumes.find((item) => item.id === project.activeVolumeId);
    return (volume?.chapterIds ?? []).flatMap((chapterId) => resolve(project.chapters.find((chapter) => chapter.id === chapterId)?.pageIds ?? []));
  }
  return project.volumes.flatMap((volume) => volume.chapterIds.flatMap((chapterId) => resolve(project.chapters.find((chapter) => chapter.id === chapterId)?.pageIds ?? [])));
}

export interface WebtoonSlice {
  parts: Array<{ pageIndex: number; sourceY: number; height: number }>;
  height: number;
}

export function planWebtoonSlices(heights: readonly number[], maxHeight: number): WebtoonSlice[] {
  const limit = Math.max(1, Math.floor(maxHeight));
  const slices: WebtoonSlice[] = [];
  let current: WebtoonSlice = { parts: [], height: 0 };
  heights.forEach((rawHeight, pageIndex) => {
    const itemHeight = Math.max(1, Math.round(rawHeight));
    let sourceY = 0;
    while (sourceY < itemHeight) {
      const available = limit - current.height;
      const height = Math.min(available, itemHeight - sourceY);
      current.parts.push({ pageIndex, sourceY, height });
      current.height += height;
      sourceY += height;
      if (current.height >= limit) {
        slices.push(current);
        current = { parts: [], height: 0 };
      }
    }
  });
  if (current.parts.length) slices.push(current);
  return slices;
}

export function backgroundForExport(format: ExportFormat, requested: string | null | undefined): string | null | undefined {
  if (requested !== undefined) return requested;
  return format === "jpg" || format === "pdf" || format === "cbz" ? "#ffffff" : undefined;
}

async function createWebtoonBlobs(pages: Array<{ page: MangaPage; blob: Blob }>, scale: number, maxHeight: number, signal?: AbortSignal): Promise<Blob[]> {
  const images = await Promise.all(pages.map(async ({ page, blob }) => {
    const url = URL.createObjectURL(blob);
    try {
      return { page, image: await loadImage(url), url };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }));
  try {
    const outputWidth = Math.max(...images.map((item) => Math.round(item.page.width * scale)));
    const slices = planWebtoonSlices(images.map((item) => Math.round(item.page.height * scale)), maxHeight);
    const results: Blob[] = [];
    for (const slice of slices) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = slice.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");
      let y = 0;
      for (const part of slice.parts) {
        const item = images[part.pageIndex];
        if (!item) continue;
        const itemWidth = Math.round(item.page.width * scale);
        ctx.drawImage(item.image, 0, part.sourceY, itemWidth, part.height, 0, y, itemWidth, part.height);
        y += part.height;
      }
      results.push(await canvasToPng(canvas, slice.height));
    }
    return results;
  } finally {
    images.forEach((item) => URL.revokeObjectURL(item.url));
  }
}

async function createWebtoonLongStripBlob(pages: Array<{ page: MangaPage; blob: Blob }>, scale: number, signal?: AbortSignal): Promise<Blob> {
  const images = await Promise.all(pages.map(async ({ page, blob }) => {
    const url = URL.createObjectURL(blob);
    try {
      return { page, image: await loadImage(url), url };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }));
  try {
    const width = Math.max(...images.map((item) => Math.round(item.page.width * scale)));
    const height = images.reduce((total, item) => total + Math.round(item.page.height * scale), 0);
    if (width * height > 50_000_000 || height > 32_000) throw new Error("ภาพ Webtoon ยาวเกินขนาด Canvas ของเบราว์เซอร์ ให้ใช้ sliced ZIP แทน");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    let y = 0;
    for (const item of images) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const itemWidth = Math.round(item.page.width * scale);
      const itemHeight = Math.round(item.page.height * scale);
      ctx.drawImage(item.image, 0, y, itemWidth, itemHeight);
      y += itemHeight;
    }
    return canvasToPng(canvas, height);
  } finally {
    images.forEach((item) => URL.revokeObjectURL(item.url));
  }
}

async function canvasToPng(canvas: HTMLCanvasElement, height: number): Promise<Blob> {
  const cropped = document.createElement("canvas");
  cropped.width = canvas.width;
  cropped.height = height;
  cropped.getContext("2d")?.drawImage(canvas, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    cropped.toBlob((blob) => blob ? resolve(blob) : reject(new Error("สร้าง Webtoon PNG ไม่สำเร็จ")), "image/png");
  });
}

export async function exportProject(project: MangaProject, filename: string, options: ExportOptions): Promise<void> {
  const pages = pagesForScope(project, options.scope ?? "page");
  if (!pages.length) throw new Error("ขอบเขตที่เลือกไม่มีหน้าสำหรับส่งออก");
  const scale = Math.max(0.25, options.scale ?? 2);
  const total = pages.length;
  const rendered: Array<{ page: MangaPage; blob: Blob; width: number; height: number }> = [];
  const exportBackground = backgroundForExport(options.format, options.backgroundColor);
  const printLayout: PrintLayoutOptions | undefined = options.format === "webtoon"
    ? undefined
    : {
        bleedMm: project.bleed,
        dpi: project.dpi,
        includeBleed: options.includeBleed ?? false,
        cropMarks: options.cropMarks ?? false,
      };
  for (const [index, page] of pages.entries()) {
    if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const blob = await renderPageBlob(page, scale, options.format === "jpg" || options.format === "pdf" ? "image/jpeg" : "image/png", options.signal, exportBackground, printLayout);
    const size = renderedPagePixelSize(page, scale, printLayout);
    rendered.push({ page, blob, ...size });
    options.onProgress?.(index + 1, total);
  }
  const base = safeFilename(filename);
  if (options.format === "png" || options.format === "jpg") {
    if (rendered.length === 1) downloadBlobFile(rendered[0]!.blob, `${base}.${options.format}`);
    else downloadBlobFile(createStoreZip(await Promise.all(rendered.map(async ({ page, blob }, index) => ({ name: `${String(index + 1).padStart(3, "0")}-${safeFilename(page.name)}.${options.format}`, data: new Uint8Array(await blob.arrayBuffer()) })))), `${base}.zip`);
    return;
  }
  if (options.format === "webtoon") {
    let longStrip: Blob | null = null;
    try {
      longStrip = await createWebtoonLongStripBlob(rendered, scale, options.signal);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("ยาวเกินขนาด Canvas")) throw error;
    }
    const blobs = await createWebtoonBlobs(rendered, scale, options.maxWebtoonHeight ?? 8000, options.signal);
    const entries = await Promise.all(blobs.map(async (blob, index) => ({ name: `${base}-${String(index + 1).padStart(2, "0")}.png`, data: new Uint8Array(await blob.arrayBuffer()) })));
    if (longStrip) entries.unshift({ name: `${base}-long.png`, data: new Uint8Array(await longStrip.arrayBuffer()) });
    else entries.unshift({ name: "README.txt", data: ascii("Long-strip PNG was omitted because it exceeded browser Canvas limits. Sliced PNG files are complete.") });
    downloadBlobFile(createStoreZip(entries), `${base}-webtoon.zip`);
    return;
  }
  if (options.format === "pdf") {
    const pdf = await createPdfDocument(rendered.map(({ page, blob, width, height }) => ({ page, blob, width, height, dpi: project.dpi * scale })));
    downloadBlobFile(pdf, `${base}.pdf`);
    return;
  }
  const entries = await Promise.all(rendered.map(async ({ page, blob }, index) => ({ name: `pages/${String(index + 1).padStart(3, "0")}-${safeFilename(page.name)}.png`, data: new Uint8Array(await blob.arrayBuffer()) })));
  entries.unshift({ name: "project.json", data: ascii(JSON.stringify({ id: project.id, name: project.name, schemaVersion: project.schemaVersion, pageIds: pages.map((page) => page.id) }, null, 2)) });
  downloadBlobFile(createStoreZip(entries), `${base}.${options.format}`);
}
