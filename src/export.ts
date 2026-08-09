import type {
  BubbleElement,
  ImageElement,
  MangaElement,
  MangaPage,
  TextAlign,
  TextElement,
} from "./types";

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
    ctx.drawImage(image, 0, 0, width, height);
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

  ctx.drawImage(image, x, y, drawWidth, drawHeight);
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

async function drawElement(ctx: CanvasRenderingContext2D, element: MangaElement): Promise<void> {
  if (element.hidden) return;

  ctx.save();
  ctx.globalAlpha = element.opacity;
  ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
  ctx.rotate((element.rotation * Math.PI) / 180);
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

export async function exportPagePng(page: MangaPage, filename: string, scale = 2): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ Canvas 2D");

  ctx.scale(scale, scale);
  ctx.fillStyle = page.background;
  ctx.fillRect(0, 0, page.width, page.height);

  for (const element of page.elements) {
    await drawElement(ctx, element);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("สร้างไฟล์ PNG ไม่สำเร็จ"));
    }, "image/png");
  });

  const safeName = filename
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName || "manga-page"}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
