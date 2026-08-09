import type { PersistedProject } from "../persistence/serialization";

export interface CherryDeskXConfig {
  appName: string;
  homeUrl: string;
  apiBaseUrl: string;
  authBaseUrl: string;
}

export interface Session {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string;
  expiresAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  tenantId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export interface ProjectRevision {
  revisionId: string;
  projectId: string;
  createdAt: string;
  createdBy: string;
  project: PersistedProject;
}

export interface WorkspaceAsset {
  assetId: string;
  workspaceId: string;
  name: string;
  mimeType: string;
  byteSize: number;
  downloadUrl?: string;
  createdAt: string;
}

export type AiJobType = "smart-layout" | "smart-crop" | "bubble-placement" | "inpaint" | "outpaint" | "remove-background" | "upscale" | "script-to-page" | "character-consistency";
export type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface AiJobRequest {
  type: AiJobType;
  projectId: string;
  assetIds: string[];
  prompt?: string;
  confirmCredits: boolean;
}

export interface AiJob {
  jobId: string;
  type: AiJobType;
  status: AiJobStatus;
  progress: number;
  creditEstimate: number;
  error?: string;
  resultAssetIds?: string[];
}

export interface CherryDeskXApi {
  getSession(): Promise<Session | null>;
  listWorkspaces(): Promise<Workspace[]>;
  getProject(projectId: string): Promise<ProjectRevision>;
  saveProject(projectId: string, project: PersistedProject, baseRevisionId?: string): Promise<ProjectRevision>;
  listAssets(workspaceId: string): Promise<WorkspaceAsset[]>;
  createAssetUpload(workspaceId: string, metadata: Pick<WorkspaceAsset, "name" | "mimeType" | "byteSize">): Promise<{ assetId: string; uploadUrl: string }>;
  getAssetDownloadUrl(assetId: string): Promise<string>;
  submitAiJob(request: AiJobRequest): Promise<AiJob>;
  getAiJob(jobId: string): Promise<AiJob>;
  cancelAiJob(jobId: string): Promise<void>;
}

export class IntegrationUnavailableError extends Error {
  constructor(message = "CherryDeskX backend ยังไม่เชื่อมต่อ") {
    super(message);
    this.name = "IntegrationUnavailableError";
  }
}

function defaultConfig(): CherryDeskXConfig {
  return {
    appName: import.meta.env.VITE_APP_NAME || "Cherry Manga Studio",
    homeUrl: import.meta.env.VITE_CHERRYDESKX_HOME || "https://cherrydeskx.com",
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "https://api.cherrydeskx.com",
    authBaseUrl: import.meta.env.VITE_AUTH_BASE_URL || "https://cherrydeskx.com",
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("CherryDeskX response ไม่ใช่ object");
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`CherryDeskX response ขาด ${name}`);
  return value;
}

function parseJob(value: unknown): AiJob {
  const record = requireRecord(value);
  const status = record.status;
  if (status !== "queued" && status !== "running" && status !== "succeeded" && status !== "failed" && status !== "cancelled") throw new Error("สถานะ AI job ไม่ถูกต้อง");
  return {
    jobId: requireString(record.jobId, "jobId"),
    type: requireString(record.type, "type") as AiJobType,
    status,
    progress: typeof record.progress === "number" ? record.progress : 0,
    creditEstimate: typeof record.creditEstimate === "number" ? record.creditEstimate : 0,
    error: typeof record.error === "string" ? record.error : undefined,
    resultAssetIds: Array.isArray(record.resultAssetIds) ? record.resultAssetIds.filter((id): id is string => typeof id === "string") : undefined,
  };
}

export class CherryDeskXHttpApi implements CherryDeskXApi {
  constructor(private readonly config: CherryDeskXConfig = defaultConfig()) {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, "")}${path}`, { ...init, credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers } });
    if (!response.ok) throw new Error(`CherryDeskX API ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  async getSession(): Promise<Session | null> {
    const value = await this.request("/v1/session");
    if (value === null) return null;
    const record = requireRecord(value);
    return { userId: requireString(record.userId, "userId"), email: requireString(record.email, "email"), displayName: requireString(record.displayName, "displayName"), tenantId: requireString(record.tenantId, "tenantId"), expiresAt: requireString(record.expiresAt, "expiresAt") };
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const value = await this.request("/v1/workspaces");
    if (!Array.isArray(value)) throw new Error("รายการ workspace ไม่ถูกต้อง");
    return value.map((item) => {
      const record = requireRecord(item);
      const role = record.role;
      if (role !== "owner" && role !== "admin" && role !== "editor" && role !== "viewer") throw new Error("role ของ workspace ไม่ถูกต้อง");
      return { id: requireString(record.id, "id"), name: requireString(record.name, "name"), tenantId: requireString(record.tenantId, "tenantId"), role };
    });
  }

  async getProject(projectId: string): Promise<ProjectRevision> {
    const value = requireRecord(await this.request(`/v1/projects/${encodeURIComponent(projectId)}`));
    return { revisionId: requireString(value.revisionId, "revisionId"), projectId: requireString(value.projectId, "projectId"), createdAt: requireString(value.createdAt, "createdAt"), createdBy: requireString(value.createdBy, "createdBy"), project: value.project as PersistedProject };
  }

  async saveProject(projectId: string, project: PersistedProject, baseRevisionId?: string): Promise<ProjectRevision> {
    const value = requireRecord(await this.request(`/v1/projects/${encodeURIComponent(projectId)}`, { method: "PUT", body: JSON.stringify({ project, baseRevisionId }) }));
    return { revisionId: requireString(value.revisionId, "revisionId"), projectId: requireString(value.projectId, "projectId"), createdAt: requireString(value.createdAt, "createdAt"), createdBy: requireString(value.createdBy, "createdBy"), project: value.project as PersistedProject };
  }

  async listAssets(workspaceId: string): Promise<WorkspaceAsset[]> {
    const value = await this.request(`/v1/workspaces/${encodeURIComponent(workspaceId)}/assets`);
    if (!Array.isArray(value)) throw new Error("รายการ asset ไม่ถูกต้อง");
    return value.map((item) => {
      const record = requireRecord(item);
      return { assetId: requireString(record.assetId, "assetId"), workspaceId: requireString(record.workspaceId, "workspaceId"), name: requireString(record.name, "name"), mimeType: requireString(record.mimeType, "mimeType"), byteSize: typeof record.byteSize === "number" ? record.byteSize : 0, downloadUrl: typeof record.downloadUrl === "string" ? record.downloadUrl : undefined, createdAt: requireString(record.createdAt, "createdAt") };
    });
  }

  async createAssetUpload(workspaceId: string, metadata: Pick<WorkspaceAsset, "name" | "mimeType" | "byteSize">): Promise<{ assetId: string; uploadUrl: string }> {
    const value = requireRecord(await this.request(`/v1/workspaces/${encodeURIComponent(workspaceId)}/assets`, { method: "POST", body: JSON.stringify(metadata) }));
    return { assetId: requireString(value.assetId, "assetId"), uploadUrl: requireString(value.uploadUrl, "uploadUrl") };
  }

  async getAssetDownloadUrl(assetId: string): Promise<string> {
    const value = requireRecord(await this.request(`/v1/assets/${encodeURIComponent(assetId)}/download`));
    return requireString(value.url, "url");
  }

  async submitAiJob(request: AiJobRequest): Promise<AiJob> {
    if (!request.confirmCredits) throw new IntegrationUnavailableError("ต้องยืนยัน credit estimate ก่อนส่ง AI job");
    return parseJob(await this.request("/v1/ai/jobs", { method: "POST", body: JSON.stringify(request) }));
  }

  async getAiJob(jobId: string): Promise<AiJob> {
    return parseJob(await this.request(`/v1/ai/jobs/${encodeURIComponent(jobId)}`));
  }

  async cancelAiJob(jobId: string): Promise<void> {
    await this.request(`/v1/ai/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", body: "{}" });
  }
}

export class DisabledCherryDeskXApi implements CherryDeskXApi {
  private unavailable(): never {
    throw new IntegrationUnavailableError("CherryDeskX SSO, Workspace และ AI API ยังไม่เปิดใช้งานใน environment นี้");
  }

  getSession(): Promise<Session | null> { return Promise.reject(this.unavailable()); }
  listWorkspaces(): Promise<Workspace[]> { return Promise.reject(this.unavailable()); }
  getProject(_projectId: string): Promise<ProjectRevision> { return Promise.reject(this.unavailable()); }
  saveProject(_projectId: string, _project: PersistedProject, _baseRevisionId?: string): Promise<ProjectRevision> { return Promise.reject(this.unavailable()); }
  listAssets(_workspaceId: string): Promise<WorkspaceAsset[]> { return Promise.reject(this.unavailable()); }
  createAssetUpload(_workspaceId: string, _metadata: Pick<WorkspaceAsset, "name" | "mimeType" | "byteSize">): Promise<{ assetId: string; uploadUrl: string }> { return Promise.reject(this.unavailable()); }
  getAssetDownloadUrl(_assetId: string): Promise<string> { return Promise.reject(this.unavailable()); }
  submitAiJob(_request: AiJobRequest): Promise<AiJob> { return Promise.reject(this.unavailable()); }
  getAiJob(_jobId: string): Promise<AiJob> { return Promise.reject(this.unavailable()); }
  cancelAiJob(_jobId: string): Promise<void> { return Promise.reject(this.unavailable()); }
}

export function createCherryDeskXApi(config: CherryDeskXConfig = defaultConfig()): CherryDeskXApi {
  return import.meta.env.VITE_ENABLE_CHERRYDESKX_API === "true" && config.apiBaseUrl ? new CherryDeskXHttpApi(config) : new DisabledCherryDeskXApi();
}
