import { createStarterProject } from "../sample";
import type { EditorPreferences, MangaElement, MangaPage, MangaProject } from "../types";

const STORAGE_KEY = "cherry-manga-studio.project.v1";
const PREFS_KEY = "cherry-manga-studio.preferences.v1";
const MAX_HISTORY = 60;

export interface RuntimeState {
  project: MangaProject;
  selectedId: string | null;
  preferences: EditorPreferences;
  historyPast: string[];
  historyFuture: string[];
  storageError: string | null;
}

function loadPreferences(): EditorPreferences {
  const defaults: EditorPreferences = {
    zoom: 0.62,
    showGrid: false,
    showSafeArea: true,
    preview: false,
    leftTab: "assets",
    tool: "select",
  };
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    return stored ? { ...defaults, ...(JSON.parse(stored) as Partial<EditorPreferences>) } : defaults;
  } catch {
    return defaults;
  }
}

function loadProject(): MangaProject {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createStarterProject();
    const parsed = JSON.parse(stored) as MangaProject;
    return parsed.pages?.length && parsed.activePageId ? parsed : createStarterProject();
  } catch {
    return createStarterProject();
  }
}

export const runtime: RuntimeState = {
  project: loadProject(),
  selectedId: null,
  preferences: loadPreferences(),
  historyPast: [],
  historyFuture: [],
  storageError: null,
};

export function activePage(): MangaPage {
  return runtime.project.pages.find((page) => page.id === runtime.project.activePageId) ?? runtime.project.pages[0]!;
}

export function selectedElement(): MangaElement | null {
  if (!runtime.selectedId) return null;
  return activePage().elements.find((element) => element.id === runtime.selectedId) ?? null;
}

function snapshot(): string {
  return JSON.stringify(runtime.project);
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

export function persistProject(): boolean {
  touchProject();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime.project));
    runtime.storageError = null;
    return true;
  } catch {
    runtime.storageError = "พื้นที่บันทึกในเบราว์เซอร์เต็ม ลองลบภาพขนาดใหญ่หรือส่งออกงานก่อน";
    return false;
  }
}

export function savePreferences(): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(runtime.preferences));
}

export function transact(mutator: () => void): boolean {
  checkpoint();
  mutator();
  return persistProject();
}

export function undoProject(): boolean {
  const previous = runtime.historyPast.pop();
  if (!previous) return false;
  runtime.historyFuture.push(snapshot());
  runtime.project = JSON.parse(previous) as MangaProject;
  runtime.selectedId = null;
  persistProject();
  return true;
}

export function redoProject(): boolean {
  const next = runtime.historyFuture.pop();
  if (!next) return false;
  runtime.historyPast.push(snapshot());
  runtime.project = JSON.parse(next) as MangaProject;
  runtime.selectedId = null;
  persistProject();
  return true;
}
