const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const EXTENSION_PATTERN = /\.(png|jpe?g|webp|svg)$/i;
const MAX_FONT_BYTES = 16 * 1024 * 1024;
const FONT_EXTENSION_PATTERN = /\.(ttf|otf|woff2?)$/i;

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
export const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";

function hasBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function hasText(bytes: Uint8Array, text: string, offset: number): boolean {
  return [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

export function sanitizeSvg(source: string): string {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  document.querySelectorAll("script,foreignObject,iframe,object,embed").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on") || /javascript\s*:/i.test(attribute.value)) node.removeAttribute(attribute.name);
    });
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

export async function validateImageFile(file: File): Promise<void> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} ใหญ่เกิน 12 MB`);
  if (!EXTENSION_PATTERN.test(file.name)) throw new Error(`${file.name} ไม่ใช่ไฟล์รูปที่รองรับ`);
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isPng = hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isJpeg = hasBytes(bytes, [0xff, 0xd8, 0xff]);
  const isWebp = hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && hasText(bytes, "WEBP", 8);
  const isSvg = /\.svg$/i.test(file.name);
  if (!isSvg && !isPng && !isJpeg && !isWebp) throw new Error(`${file.name} ไม่ผ่านการตรวจ file signature`);
  if (isSvg) {
    const source = await file.text();
    if (!/<svg[\s>]/i.test(source)) throw new Error(`${file.name} ไม่ใช่ SVG ที่ถูกต้อง`);
    const clean = sanitizeSvg(source);
    if (!clean.includes("<svg")) throw new Error(`${file.name} ไม่ผ่านการ sanitize`);
  }
}

export function safeAssetMimeType(file: File): string {
  if (/\.svg$/i.test(file.name)) return "image/svg+xml";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return "image/png";
}

export async function validateFontFile(file: File): Promise<void> {
  if (file.size > MAX_FONT_BYTES) throw new Error(`${file.name} ใหญ่เกิน 16 MB`);
  if (!FONT_EXTENSION_PATTERN.test(file.name)) throw new Error(`${file.name} ไม่ใช่ไฟล์ฟอนต์ที่รองรับ`);
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isTrueType = hasBytes(bytes, [0x00, 0x01, 0x00, 0x00]) || hasText(bytes, "true", 0);
  const isOpenType = hasText(bytes, "OTTO", 0);
  const isWoff = hasText(bytes, "wOFF", 0);
  const isWoff2 = hasText(bytes, "wOF2", 0);
  if (!isTrueType && !isOpenType && !isWoff && !isWoff2) throw new Error(`${file.name} ไม่ผ่านการตรวจ file signature`);
}

export function safeFontMimeType(file: File): string {
  if (/\.woff2$/i.test(file.name)) return "font/woff2";
  if (/\.woff$/i.test(file.name)) return "font/woff";
  if (/\.otf$/i.test(file.name)) return "font/otf";
  return "font/ttf";
}
