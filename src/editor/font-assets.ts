import { uid } from "../sample";
import { safeFontMimeType, validateFontFile } from "../security/files";
import type { MangaAsset, MangaProject } from "../types";
import { runtime, transact } from "./state";

interface RegisteredFont {
  source: string;
  face: FontFace;
}

const registeredFontAssets = new Map<string, RegisteredFont>();
const failedFontAssets = new Map<string, string>();

export function fontFamilyFromFilename(filename: string): string {
  const basename = filename.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[;{}<>"']/g, "").trim().slice(0, 72);
  return `Cherry ${basename || "Embedded Font"}`;
}

export async function registerFontAsset(asset: MangaAsset): Promise<void> {
  if (asset.kind !== "font" || !asset.fontFamily || !asset.src || registeredFontAssets.get(asset.id)?.source === asset.src) return;
  if (typeof FontFace === "undefined" || typeof document === "undefined") throw new Error("เบราว์เซอร์นี้ไม่รองรับการโหลดฟอนต์แบบ local");
  const source = asset.src.replace(/["\\\n\r]/g, "");
  const face = new FontFace(asset.fontFamily, `url("${source}")`);
  try {
    const loaded = await face.load();
    const previous = registeredFontAssets.get(asset.id);
    if (previous) document.fonts.delete(previous.face);
    document.fonts.add(loaded);
    registeredFontAssets.set(asset.id, { source: asset.src, face: loaded });
    failedFontAssets.delete(asset.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "FontFace ปฏิเสธไฟล์นี้";
    failedFontAssets.set(asset.id, message);
    throw new Error(`โหลดฟอนต์ ${asset.name} ไม่สำเร็จ: ${message}`);
  }
}

export function embeddedFontStatus(assetId: string): { status: "ready" | "error" | "loading"; reason?: string } {
  if (registeredFontAssets.has(assetId)) return { status: "ready" };
  const reason = failedFontAssets.get(assetId);
  return reason ? { status: "error", reason } : { status: "loading" };
}

export async function registerProjectFonts(project: MangaProject): Promise<void> {
  await Promise.all(project.assets.filter((asset) => asset.kind === "font").map(async (asset) => {
    try {
      await registerFontAsset(asset);
    } catch {
      // A missing or browser-rejected font falls back visibly to the next CSS font.
    }
  }));
}

export function removeEmbeddedFont(assetId: string): boolean {
  const asset = runtime.project.assets.find((candidate) => candidate.id === assetId && candidate.kind === "font");
  if (!asset) return false;
  const fallback = "system-ui, sans-serif";
  transact(() => {
    for (const page of runtime.project.pages) {
      for (const element of page.elements) {
        if ((element.kind === "text" || element.kind === "bubble") && element.fontFamily === asset.fontFamily) element.fontFamily = fallback;
      }
    }
    for (const style of runtime.project.textStyles) if (style.fontFamily === asset.fontFamily) style.fontFamily = fallback;
    runtime.project.assets = runtime.project.assets.filter((candidate) => candidate.id !== assetId);
  });
  const registered = registeredFontAssets.get(assetId);
  if (registered && typeof document !== "undefined") document.fonts.delete(registered.face);
  registeredFontAssets.delete(assetId);
  failedFontAssets.delete(assetId);
  const source = runtime.assetSources.get(assetId) ?? asset.src;
  if (source.startsWith("blob:")) URL.revokeObjectURL(source);
  runtime.assetSources.delete(assetId);
  void runtime.persistence.assets.remove(assetId);
  return true;
}

export async function handleFontUploads(files: FileList | null): Promise<number> {
  if (!files?.length) return 0;
  const selectedFiles = [...files];
  await Promise.all(selectedFiles.map(validateFontFile));
  const loaded: MangaAsset[] = [];
  try {
    for (const file of selectedFiles) {
      const blob = file.slice(0, file.size, safeFontMimeType(file));
      const asset: MangaAsset = {
        id: uid("font"),
        kind: "font",
        name: file.name,
        src: URL.createObjectURL(blob),
        mimeType: blob.type,
        byteSize: blob.size,
        width: 0,
        height: 0,
        fontFamily: fontFamilyFromFilename(file.name),
        createdAt: new Date().toISOString(),
      };
      await registerFontAsset(asset);
      await runtime.persistence.assets.put(asset.id, blob);
      runtime.assetSources.set(asset.id, asset.src);
      loaded.push(asset);
    }
  } catch (error) {
    await Promise.all(loaded.map((asset) => runtime.persistence.assets.remove(asset.id)));
    for (const asset of loaded) {
      runtime.assetSources.delete(asset.id);
      URL.revokeObjectURL(asset.src);
    }
    throw error;
  }
  transact(() => runtime.project.assets.push(...loaded));
  return loaded.length;
}
