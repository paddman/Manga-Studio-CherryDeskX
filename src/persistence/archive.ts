import { migrateProject, serializeProject } from "./serialization";
import { PROJECT_SCHEMA_VERSION, type MangaProject } from "../types";
import type { AssetRepository, RasterRepository } from "./repository";

export interface ImportedProjectBundle {
  project: MangaProject;
  assets: Map<string, Blob>;
  rasters: Map<string, Blob>;
}

interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

function read32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0;
}

function read16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function write16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function write32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function join(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: ArchiveEntry[]): Blob {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localFile = join([Uint8Array.of(0x50, 0x4b, 0x03, 0x04), write16(20), write16(0), write16(0), write16(0), write16(0), write32(checksum), write32(entry.data.length), write32(entry.data.length), write16(name.length), write16(0), name, entry.data]);
    local.push(localFile);
    central.push(join([Uint8Array.of(0x50, 0x4b, 0x01, 0x02), write16(20), write16(20), write16(0), write16(0), write16(0), write16(0), write32(checksum), write32(entry.data.length), write32(entry.data.length), write16(name.length), write16(0), write16(0), write16(0), write16(0), write32(0), write32(offset), name]));
    offset += localFile.length;
  }
  const localBytes = join(local);
  const centralBytes = join(central);
  const end = join([Uint8Array.of(0x50, 0x4b, 0x05, 0x06), write16(0), write16(0), write16(entries.length), write16(entries.length), write32(centralBytes.length), write32(localBytes.length), write16(0)]);
  return new Blob([localBytes, centralBytes, end], { type: "application/vnd.cherrydeskx.manga+zip" });
}

export async function exportProjectBundle(project: MangaProject, assets: AssetRepository, rasters?: RasterRepository): Promise<Blob> {
  const entries: ArchiveEntry[] = [{ name: "project.json", data: new TextEncoder().encode(JSON.stringify(serializeProject(project), null, 2)) }];
  for (const asset of project.assets) {
    const blob = await assets.get(asset.id);
    if (!blob) continue;
    entries.push({ name: `assets/${asset.id}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  if (rasters) {
    for (const page of project.pages) {
      for (const layer of page.rasterLayers) {
        if (!layer.bitmapKey) continue;
        const blob = await rasters.get(layer.bitmapKey);
        if (blob) entries.push({ name: `rasters/${layer.bitmapKey}`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
    }
  }
  return zipStore(entries);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (read32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

export function assertSupportedProjectSchema(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("project.json ไม่มีโครงสร้างโปรเจกต์");
  const record = value as Record<string, unknown>;
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== undefined && (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1)) throw new Error("schemaVersion ใน project.json ไม่ถูกต้อง");
  if (typeof schemaVersion === "number" && schemaVersion > PROJECT_SCHEMA_VERSION) throw new Error(`ไฟล์นี้ใช้ schema version ${schemaVersion} แต่แอปรองรับถึง version ${PROJECT_SCHEMA_VERSION}`);
  if (!Array.isArray(record.pages) || record.pages.length < 1) throw new Error("project.json ไม่มีหน้ามังงะให้เปิด");
}

export async function importProjectBundle(file: Blob): Promise<ImportedProjectBundle> {
  const maxArchiveBytes = 512 * 1024 * 1024;
  const maxEntryBytes = 256 * 1024 * 1024;
  const maxEntries = 10_000;
  if (file.size > maxArchiveBytes) throw new Error("ไฟล์ .cherrymanga ใหญ่เกิน 512 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) throw new Error("ไฟล์ .cherrymanga ไม่ใช่ ZIP ที่ถูกต้อง");
  const count = read16(bytes, endOffset + 10);
  if (count < 1 || count > maxEntries) throw new Error("จำนวนไฟล์ใน .cherrymanga ไม่ถูกต้อง");
  const centralSize = read32(bytes, endOffset + 12);
  const centralOffset = read32(bytes, endOffset + 16);
  if (centralOffset + centralSize > bytes.length) throw new Error("ไฟล์โปรเจกต์เสียหาย");
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length) throw new Error("ตารางไฟล์ใน archive ไม่ครบ");
    if (read32(bytes, offset) !== 0x02014b50) throw new Error("ตารางไฟล์ใน archive เสียหาย");
    const checksum = read32(bytes, offset + 16);
    const compressedSize = read32(bytes, offset + 20);
    const uncompressedSize = read32(bytes, offset + 24);
    const method = read16(bytes, offset + 10);
    const nameLength = read16(bytes, offset + 28);
    const extraLength = read16(bytes, offset + 30);
    const commentLength = read16(bytes, offset + 32);
    const localOffset = read32(bytes, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > centralOffset + centralSize || nextOffset > bytes.length) throw new Error("ชื่อไฟล์ใน archive ไม่ครบ");
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (method !== 0) throw new Error("ไฟล์นี้ใช้ compression ที่ยังไม่รองรับ");
    if (compressedSize !== uncompressedSize || uncompressedSize > maxEntryBytes) throw new Error("ขนาดไฟล์ย่อยใน archive ไม่ปลอดภัย");
    if (files.has(name)) throw new Error(`พบไฟล์ซ้ำใน archive: ${name}`);
    if (name !== "project.json" && !name.startsWith("assets/") && !name.startsWith("rasters/")) throw new Error(`พบ path ที่ไม่รองรับใน archive: ${name}`);
    if (name.includes("\\") || name.startsWith("/") || name.split("/").some((part) => part === "." || part === ".." || part.includes("\0"))) throw new Error(`path ใน archive ไม่ปลอดภัย: ${name}`);
    if (localOffset + 30 > bytes.length || read32(bytes, localOffset) !== 0x04034b50) throw new Error("local file header ใน archive เสียหาย");
    const localNameLength = read16(bytes, localOffset + 26);
    const localExtraLength = read16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error(`ข้อมูลไฟล์ ${name} ไม่ครบ`);
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== checksum) throw new Error(`checksum ของ ${name} ไม่ถูกต้อง`);
    files.set(name, data);
    offset = nextOffset;
  }
  const projectData = files.get("project.json");
  if (!projectData) throw new Error("ไม่พบ project.json ในไฟล์ .cherrymanga");
  if (projectData.length > 10 * 1024 * 1024) throw new Error("project.json ใหญ่เกิน 10 MB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(projectData)) as unknown;
  } catch {
    throw new Error("project.json ไม่ใช่ JSON ที่ถูกต้อง");
  }
  assertSupportedProjectSchema(parsed);
  const project = migrateProject(parsed);
  const assets = new Map<string, Blob>();
  for (const asset of project.assets) {
    const data = files.get(`assets/${asset.id}`);
    if (data) assets.set(asset.id, new Blob([data], { type: asset.mimeType }));
  }
  const rasters = new Map<string, Blob>();
  for (const page of project.pages) {
    for (const layer of page.rasterLayers) {
      if (!layer.bitmapKey) continue;
      const data = files.get(`rasters/${layer.bitmapKey}`);
      if (data) rasters.set(layer.bitmapKey, new Blob([data], { type: "image/png" }));
    }
  }
  return { project, assets, rasters };
}
