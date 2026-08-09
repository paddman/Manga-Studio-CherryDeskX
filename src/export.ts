import type {
  BubbleElement,
  ImageElement,
  MangaElement,
  MangaPage,
  TextAlign,
  TextElement,
  MangaProject,
} from "./types";

export type ExportFormat = "png" | "jpg" | "pdf" | "cbz" | "zip" | "webtoon";
export type ExportScope = "page" | "chapter" | "volume" | "project";

export interface ExportOptions {
  format: ExportFormat;
  scope?: ExportScope;
  scale?: number;
  maxWebtoonHeight?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
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

function segmentText(text: string): string[] {
  try {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });
    return [...segmenter.segment(text)].map((part) => part.segment);
  } catch {
    return [...text];
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }

    const segments = segmentText(paragraph);
    let line = "";
    for (const segment of segments) {
      const candidate = `${line}${segment}`;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line.trimEnd());
        line = segment.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line.trimEnd());
  }

  return lines;
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
  } = options;

  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, text, Math.max(12, width - padding * 2));
  const step = fontSize * lineHeight;
  const totalHeight = lines.length * step;
  let y = verticalCenter ? Math.max(padding, (height - totalHeight) / 2) : padding;
  const x = alignX(align, width, padding);

  for (const line of lines) {
    ctx.fillText(line, x, y, Math.max(12, width - padding * 2));
    y += step;
    if (y > height - padding) break;
  }
}

function drawTextElement(ctx: CanvasRenderingContext2D, element: TextElement): void {
  drawTextBlock(ctx, {
    text: element.text,
    width: element.width,
    height: element.height,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    fontFamily: element.fontFamily,
    color: element.color,
    align: element.align,
    lineHeight: element.lineHeight,
    padding: 4,
    letterSpacing: element.letterSpacing,
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

  if (variant === "shout") {
    drawShoutShape(ctx, width, height);
    ctx.fill();
    if (borderWidth > 0) ctx.stroke();
  } else if (variant === "caption") {
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
    } else {
      ctx.beginPath();
      ctx.moveTo(width * 0.64, height * 0.76);
      ctx.lineTo(Math.min(width, element.tailX), Math.min(height, element.tailY));
      ctx.lineTo(width * 0.78, height * 0.73);
      ctx.closePath();
      ctx.fill();
      if (borderWidth > 0) ctx.stroke();
    }
  }

  drawTextBlock(ctx, {
    text: element.text,
    width,
    height: variant === "caption" ? height : height * 0.82,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    fontFamily: "system-ui, sans-serif",
    color: element.color,
    align: element.align,
    lineHeight: 1.26,
    padding: Math.max(12, element.fontSize * 0.65),
    verticalCenter: true,
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

export async function renderPageBlob(page: MangaPage, scale = 2, mimeType: "image/png" | "image/jpeg" = "image/png", signal?: AbortSignal): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");

  ctx.scale(scale, scale);
  ctx.fillStyle = page.background;
  ctx.fillRect(0, 0, page.width, page.height);

  for (const element of page.elements) {
    if (element.parentId) continue;
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    await drawElement(ctx, element, page);
  }

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

function zipStore(entries: ArchiveEntry[]): Blob {
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

async function createPdf(pages: Array<{ page: MangaPage; blob: Blob; width: number; height: number }>): Promise<Blob> {
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
    const pdfWidth = Math.round(item.page.width * 72 / 96);
    const pdfHeight = Math.round(item.page.height * 72 / 96);
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

function pagesForScope(project: MangaProject, scope: ExportScope): MangaPage[] {
  if (scope === "page") return [project.pages.find((page) => page.id === project.activePageId) ?? project.pages[0]!];
  if (scope === "chapter") {
    const chapter = project.chapters.find((item) => item.id === project.activeChapterId);
    return project.pages.filter((page) => chapter?.pageIds.includes(page.id));
  }
  if (scope === "volume") {
    const volume = project.volumes.find((item) => item.id === project.activeVolumeId);
    const chapterIds = new Set(volume?.chapterIds ?? []);
    return project.pages.filter((page) => chapterIds.has(page.chapterId));
  }
  return [...project.pages].sort((a, b) => a.order - b.order);
}

async function createWebtoonBlobs(pages: Array<{ page: MangaPage; blob: Blob }>, scale: number, maxHeight: number, signal?: AbortSignal): Promise<Blob[]> {
  const images = await Promise.all(pages.map(async ({ page, blob }) => ({ page, image: await loadImage(URL.createObjectURL(blob)) })));
  const results: Blob[] = [];
  let current = document.createElement("canvas");
  current.width = Math.max(...images.map((item) => Math.round(item.page.width * scale)));
  current.height = maxHeight;
  let ctx = current.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");
  let y = 0;
  for (const item of images) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const height = Math.round(item.page.height * scale);
    if (y > 0 && y + height > maxHeight) {
      const blob = await canvasToPng(current, y);
      results.push(blob);
      current = document.createElement("canvas");
      current.width = Math.max(...images.map((candidate) => Math.round(candidate.page.width * scale)));
      current.height = maxHeight;
      ctx = current.getContext("2d");
      if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");
      y = 0;
    }
    ctx.drawImage(item.image, 0, y, Math.round(item.page.width * scale), height);
    y += height;
  }
  if (y > 0) results.push(await canvasToPng(current, y));
  return results;
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
  const scale = Math.max(0.25, options.scale ?? 2);
  const total = pages.length;
  const rendered: Array<{ page: MangaPage; blob: Blob }> = [];
  for (const [index, page] of pages.entries()) {
    if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const blob = await renderPageBlob(page, scale, options.format === "jpg" || options.format === "pdf" ? "image/jpeg" : "image/png", options.signal);
    rendered.push({ page, blob });
    options.onProgress?.(index + 1, total);
  }
  const base = safeFilename(filename);
  if (options.format === "png" || options.format === "jpg") {
    if (rendered.length === 1) downloadBlobFile(rendered[0]!.blob, `${base}.${options.format}`);
    else downloadBlobFile(zipStore(await Promise.all(rendered.map(async ({ page, blob }, index) => ({ name: `${String(index + 1).padStart(3, "0")}-${safeFilename(page.name)}.${options.format}`, data: new Uint8Array(await blob.arrayBuffer()) })))), `${base}.zip`);
    return;
  }
  if (options.format === "webtoon") {
    const blobs = await createWebtoonBlobs(rendered, scale, options.maxWebtoonHeight ?? 8000, options.signal);
    downloadBlobFile(zipStore(await Promise.all(blobs.map(async (blob, index) => ({ name: `${base}-${String(index + 1).padStart(2, "0")}.png`, data: new Uint8Array(await blob.arrayBuffer()) })))), `${base}-webtoon.zip`);
    return;
  }
  if (options.format === "pdf") {
    const pdf = await createPdf(rendered.map(({ page, blob }) => ({ page, blob, width: Math.round(page.width * scale), height: Math.round(page.height * scale) })));
    downloadBlobFile(pdf, `${base}.pdf`);
    return;
  }
  const entries = await Promise.all(rendered.map(async ({ page, blob }, index) => ({ name: `pages/${String(index + 1).padStart(3, "0")}-${safeFilename(page.name)}.png`, data: new Uint8Array(await blob.arrayBuffer()) })));
  entries.unshift({ name: "project.json", data: ascii(JSON.stringify({ id: project.id, name: project.name, schemaVersion: project.schemaVersion, pageIds: pages.map((page) => page.id) }, null, 2)) });
  downloadBlobFile(zipStore(entries), `${base}.${options.format}`);
}
