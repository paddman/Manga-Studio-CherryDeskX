import { exportProject, type ExportOptions } from "../export";
import type { MangaProject } from "../types";

export interface ExportJobRunner {
  readonly execution: "inline" | "worker";
  run(project: MangaProject, filename: string, options: ExportOptions): Promise<void>;
}

export interface ExportWorkerCapability {
  status: "adapter";
  reason: string;
}

export const EXPORT_WORKER_CAPABILITY: ExportWorkerCapability = {
  status: "adapter",
  reason: "Canvas, font และ object URL ยังต้องย้ายเข้า worker-safe renderer ใน phase ถัดไป",
};

export class InlineExportJobRunner implements ExportJobRunner {
  readonly execution = "inline" as const;

  run(project: MangaProject, filename: string, options: ExportOptions): Promise<void> {
    return exportProject(project, filename, options);
  }
}

export const localExportJobRunner: ExportJobRunner = new InlineExportJobRunner();
