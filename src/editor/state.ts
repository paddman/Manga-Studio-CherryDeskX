import { createStarterProject } from "../sample";
import { createPersistenceRepositories, type PersistenceRepositories } from "../persistence/repository";
import { hydrateAssetSources, migrateProject, serializeProject } from "../persistence/serialization";
import { toolId } from "./tools";
import type { EditorPreferences, MangaElement, MangaPage, MangaProject, PixelSelectionShape, RasterStroke, SelectionGuide } from "../types";

const PREFS_KEY = "cherry-manga-studio.preferences.v2";
const LEGACY_PREFS_KEY = "cherry-manga-studio.preferences.v1";
const RECOVERY_KEY = "cherry-manga-studio.recovery.v2";
const MAX_HISTORY = 60;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export type SaveStatus = "saving" | "saved" | "offline" | "error";

export interface SelectionRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RuntimeState {
  project: MangaProject;
  selectedId: string | null;
  selectedIds: string[];
  preferences: EditorPreferences;
  historyPast: string[];
  historyFuture: string[];
  storageError: string | null;
  saveStatus: SaveStatus;
  selectionGuides: SelectionGuide[];
  selectionRectangle: SelectionRectangle | null;
  pixelSelection: PixelSelectionShape | null;
  rasterPreview: RasterStroke | null;
  assetSources: Map<string, string>;
  persistence: PersistenceRepositories;
  persistenceReady: boolean;
  clipboard: MangaElement[];
}

function loadPreferences(): EditorPreferences {
  const defaults: EditorPreferences = {
    zoom: 0.62,
    showGrid: false,
    showSafeArea: true,
    preview: false,
    leftTab: "assets",
    tool: toolId("select"),
    cropElementId: null,
    brushColor: "#17131f",
    brushSize: 18,
    brushOpacity: 0.85,
    activeRasterLayerId: null,
    exportTransparent: false,
    exportBackgroundColor: "#ffffff",
  };
  if (typeof localStorage === "undefined") return defaults;
  try {
    const stored = localStorage.getItem(PREFS_KEY) ?? localStorage.getItem(LEGACY_PREFS_KEY);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<EditorPreferences>;
    return {
      ...defaults,
      ...parsed,
      tool: typeof parsed.tool === "string" ? toolId(parsed.tool) : defaults.tool,
      cropElementId: null,
    };
  } catch {
    return defaults;
  }
}

function loadProject(): MangaProject {
  if (typeof localStorage === "undefined") return createStarterProject();
  try {
    const stored = localStorage.getItem(RECOVERY_KEY) ?? localStorage.getItem("cherry-manga-studio.project.v2") ?? localStorage.getItem("cherry-manga-studio.project.v1");
    return stored ? migrateProject(JSON.parse(stored) as unknown) : createStarterProject();
  } catch {
    return createStarterProject();
  }
}

export const runtime: RuntimeState = {
  project: loadProject(),
  selectedId: null,
  selectedIds: [],
  preferences: loadPreferences(),
  historyPast: [],
  historyFuture: [],
  storageError: null,
  saveStatus: "saved",
  selectionGuides: [],
  selectionRectangle: null,
  pixelSelection: null,
  rasterPreview: null,
  assetSources: new Map<string, string>(),
  persistence: createPersistenceRepositories(),
  persistenceReady: false,
  clipboard: [],
};

export function activePage(): MangaPage {
  return runtime.project.pages.find((page) => page.id === runtime.project.activePageId) ?? runtime.project.pages[0]!;
}

export function selectedElements(): MangaElement[] {
  const selected = new Set(runtime.selectedIds);
  if (runtime.selectedId) selected.add(runtime.selectedId);
  return activePage().elements.filter((element) => selected.has(element.id));
}

export function selectedElement(): MangaElement | null {
  const id = runtime.selectedId ?? runtime.selectedIds[0];
  if (!id) return null;
  return activePage().elements.find((element) => element.id === id) ?? null;
}

export function setSelection(ids: string[]): void {
  const elements = activePage().elements;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const expanded = ids.flatMap((id) => {
    const element = byId.get(id);
    if (!element) return [];
    return element.groupId ? elements.filter((candidate) => candidate.groupId === element.groupId).map((candidate) => candidate.id) : [id];
  });
  const uniqueIds = [...new Set(expanded)];
  runtime.selectedIds = uniqueIds;
  runtime.selectedId = uniqueIds.at(-1) ?? null;
}

function snapshot(): string {
  return JSON.stringify(serializeProject(runtime.project));
}

export function checkpoint(): void {
  const current = snapshot();
  if (runtime.historyPast.at(-1) !== current) {
    runtime.historyPast.push(current);
    if (runtime.historyPast.length > MAX_HISTORY) runtime.historyPast.shift();
  }
  runtime.historyFuture = [];
}

export function touchProject(): void {
  runtime.project.updatedAt = new Date().toISOString();
}

function dataUrlToBlob(source: string): Blob | null {
  const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] ?? "";
  try {
    if (match[2]) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Blob([bytes], { type: mimeType });
    }
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  } catch {
    return null;
  }
}

async function persistRuntimeAssets(): Promise<void> {
  for (const asset of runtime.project.assets) {
    const source = runtime.assetSources.get(asset.id) ?? asset.src;
    if (!source) continue;
    if (runtime.assetSources.has(asset.id) && !source.startsWith("data:")) continue;
    const blob = dataUrlToBlob(source);
    if (!blob) continue;
    await runtime.persistence.assets.put(asset.id, blob);
    const objectUrl = URL.createObjectURL(blob);
    runtime.assetSources.set(asset.id, objectUrl);
    asset.src = objectUrl;
  }
  hydrateAssetSources(runtime.project, runtime.assetSources);
}

export async function initializePersistence(): Promise<void> {
  try {
    const stored = await runtime.persistence.projects.load();
    if (stored) runtime.project = migrateProject(stored);
    await persistRuntimeAssets();
    const sources = new Map<string, string>();
    for (const asset of runtime.project.assets) {
      if (runtime.assetSources.has(asset.id)) continue;
      const blob = await runtime.persistence.assets.get(asset.id);
      if (!blob) continue;
      const objectUrl = URL.createObjectURL(blob);
      sources.set(asset.id, objectUrl);
      runtime.assetSources.set(asset.id, objectUrl);
    }
    hydrateAssetSources(runtime.project, sources);
    runtime.persistenceReady = true;
    runtime.saveStatus = "saved";
    runtime.storageError = null;
    await runtime.persistence.projects.save(serializeProject(runtime.project));
    if (typeof localStorage !== "undefined") localStorage.removeItem(RECOVERY_KEY);
  } catch (error) {
    runtime.persistenceReady = true;
    runtime.saveStatus = "offline";
    runtime.storageError = error instanceof Error ? error.message : "พื้นที่จัดเก็บออฟไลน์ยังไม่พร้อมใช้งาน";
  }
}

export function persistProject(): boolean {
  touchProject();
  runtime.saveStatus = "saving";
  try {
    const persisted = serializeProject(runtime.project);
    const serialized = JSON.stringify(persisted);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("cherry-manga-studio.project.v2", serialized);
      localStorage.setItem(RECOVERY_KEY, serialized);
    }
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistRuntimeAssets()
        .then(() => runtime.persistence.projects.save(serializeProject(runtime.project)))
        .then(() => {
          runtime.saveStatus = "saved";
          runtime.storageError = null;
          if (typeof localStorage !== "undefined") localStorage.removeItem(RECOVERY_KEY);
        })
        .catch((error: unknown) => {
          runtime.saveStatus = "offline";
          runtime.storageError = error instanceof Error ? error.message : "บันทึกโปรเจกต์ไม่สำเร็จ";
        });
    }, 250);
    return true;
  } catch {
    runtime.saveStatus = "error";
    runtime.storageError = "พื้นที่บันทึกในเบราว์เซอร์เต็ม ลองส่งออกงานก่อน";
    return false;
  }
}

export function savePreferences(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(runtime.preferences));
  } catch {
    // Preferences are optional and must never block editing.
  }
}

export function transact(mutator: () => void): boolean {
  checkpoint();
  mutator();
  return persistProject();
}

function restoreSnapshot(value: string): void {
  runtime.project = migrateProject(JSON.parse(value) as unknown);
  hydrateAssetSources(runtime.project, runtime.assetSources);
  runtime.selectedId = null;
  runtime.selectedIds = [];
  runtime.preferences.cropElementId = null;
}

export function undoProject(): boolean {
  const previous = runtime.historyPast.pop();
  if (!previous) return false;
  runtime.historyFuture.push(snapshot());
  restoreSnapshot(previous);
  persistProject();
  return true;
}

export function redoProject(): boolean {
  const next = runtime.historyFuture.pop();
  if (!next) return false;
  runtime.historyPast.push(snapshot());
  restoreSnapshot(next);
  persistProject();
  return true;
}
