import { migrateProject, serializeProject, type PersistedProject } from "./serialization";

const DATABASE_NAME = "cherry-manga-studio";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const PROJECT_KEY = "current";

export interface ProjectRepository {
  load(): Promise<PersistedProject | null>;
  save(project: PersistedProject): Promise<void>;
}

export interface AssetRepository {
  put(assetId: string, blob: Blob): Promise<void>;
  get(assetId: string): Promise<Blob | null>;
  remove(assetId: string): Promise<void>;
  listIds(): Promise<string[]>;
}

export interface PersistenceRepositories {
  projects: ProjectRepository;
  assets: AssetRepository;
}

interface StoredAsset {
  assetId: string;
  blob: Blob;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) database.createObjectStore(PROJECT_STORE);
      if (!database.objectStoreNames.contains(ASSET_STORE)) database.createObjectStore(ASSET_STORE, { keyPath: "assetId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("เปิด IndexedDB ไม่สำเร็จ"));
  });
}

export class IndexedDbProjectRepository implements ProjectRepository {
  async load(): Promise<PersistedProject | null> {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const stored = await requestResult<string | undefined>(transaction.objectStore(PROJECT_STORE).get(PROJECT_KEY));
    await transactionDone(transaction);
    if (!stored) return null;
    return serializeProject(migrateProject(JSON.parse(stored) as unknown));
  }

  async save(project: PersistedProject): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(JSON.stringify(project), PROJECT_KEY);
    await transactionDone(transaction);
  }
}

export class IndexedDbAssetRepository implements AssetRepository {
  async put(assetId: string, blob: Blob): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    const record: StoredAsset = { assetId, blob };
    transaction.objectStore(ASSET_STORE).put(record);
    await transactionDone(transaction);
  }

  async get(assetId: string): Promise<Blob | null> {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const record = await requestResult<StoredAsset | undefined>(transaction.objectStore(ASSET_STORE).get(assetId));
    await transactionDone(transaction);
    return record?.blob ?? null;
  }

  async remove(assetId: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).delete(assetId);
    await transactionDone(transaction);
  }

  async listIds(): Promise<string[]> {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const records = await requestResult<StoredAsset[]>(transaction.objectStore(ASSET_STORE).getAll());
    await transactionDone(transaction);
    return records.map((record) => record.assetId);
  }
}

export class LocalStorageProjectRepository implements ProjectRepository {
  constructor(private readonly key = "cherry-manga-studio.project.v2") {}

  async load(): Promise<PersistedProject | null> {
    try {
      const stored = localStorage.getItem(this.key) ?? localStorage.getItem("cherry-manga-studio.project.v1");
      return stored ? serializeProject(migrateProject(JSON.parse(stored) as unknown)) : null;
    } catch {
      return null;
    }
  }

  async save(project: PersistedProject): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(project));
  }
}

export class MemoryAssetRepository implements AssetRepository {
  private readonly assets = new Map<string, Blob>();

  async put(assetId: string, blob: Blob): Promise<void> {
    this.assets.set(assetId, blob);
  }

  async get(assetId: string): Promise<Blob | null> {
    return this.assets.get(assetId) ?? null;
  }

  async remove(assetId: string): Promise<void> {
    this.assets.delete(assetId);
  }

  async listIds(): Promise<string[]> {
    return [...this.assets.keys()];
  }
}

class ResilientProjectRepository implements ProjectRepository {
  private useFallback = false;

  constructor(private readonly primary: ProjectRepository, private readonly fallback: ProjectRepository) {}

  async load(): Promise<PersistedProject | null> {
    if (this.useFallback) return this.fallback.load();
    try {
      return await this.primary.load();
    } catch {
      this.useFallback = true;
      return this.fallback.load();
    }
  }

  async save(project: PersistedProject): Promise<void> {
    if (this.useFallback) return this.fallback.save(project);
    try {
      await this.primary.save(project);
    } catch {
      this.useFallback = true;
      await this.fallback.save(project);
    }
  }
}

class ResilientAssetRepository implements AssetRepository {
  private useFallback = false;

  constructor(private readonly primary: AssetRepository, private readonly fallback: AssetRepository) {}

  async put(assetId: string, blob: Blob): Promise<void> {
    if (this.useFallback) return this.fallback.put(assetId, blob);
    try {
      await this.primary.put(assetId, blob);
    } catch {
      this.useFallback = true;
      await this.fallback.put(assetId, blob);
    }
  }

  async get(assetId: string): Promise<Blob | null> {
    if (this.useFallback) return this.fallback.get(assetId);
    try {
      return await this.primary.get(assetId);
    } catch {
      this.useFallback = true;
      return this.fallback.get(assetId);
    }
  }

  async remove(assetId: string): Promise<void> {
    if (this.useFallback) return this.fallback.remove(assetId);
    try {
      await this.primary.remove(assetId);
    } catch {
      this.useFallback = true;
      await this.fallback.remove(assetId);
    }
  }

  async listIds(): Promise<string[]> {
    if (this.useFallback) return this.fallback.listIds();
    try {
      return await this.primary.listIds();
    } catch {
      this.useFallback = true;
      return this.fallback.listIds();
    }
  }
}

export function createPersistenceRepositories(): PersistenceRepositories {
  if (typeof indexedDB !== "undefined") {
    return {
      projects: new ResilientProjectRepository(new IndexedDbProjectRepository(), new LocalStorageProjectRepository()),
      assets: new ResilientAssetRepository(new IndexedDbAssetRepository(), new MemoryAssetRepository()),
    };
  }
  return { projects: new LocalStorageProjectRepository(), assets: new MemoryAssetRepository() };
}
