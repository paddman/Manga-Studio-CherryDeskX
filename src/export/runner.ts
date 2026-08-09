import { exportProject, type ArchiveEntry, type ExportOptions, type ExportPackagingAdapter, type PdfPageInput } from "../export";
import type { MangaProject } from "../types";
import type { PackagingWorkerRequest, PackagingWorkerResponse } from "./worker-protocol";

export interface ExportJobRunner {
  readonly execution: "inline" | "hybrid-worker" | "worker";
  run(project: MangaProject, filename: string, options: ExportOptions): Promise<void>;
}

export interface ExportWorkerCapability {
  status: "experimental";
  reason: string;
}

export const EXPORT_WORKER_CAPABILITY: ExportWorkerCapability = {
  status: "experimental",
  reason: "ZIP/CBZ/PDF packaging ทำใน Web Worker แล้ว; Canvas, font และ object URL rendering ยังอยู่ main thread",
};

function abortError(): DOMException {
  return new DOMException("Export cancelled", "AbortError");
}

function runPackagingWorker(request: PackagingWorkerRequest, transfer: Transferable[], signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./packaging.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback();
    };
    const abort = (): void => finish(() => reject(abortError()));
    worker.addEventListener("message", (event: MessageEvent<PackagingWorkerResponse>) => {
      if (event.data.id !== request.id) return;
      finish(() => event.data.ok ? resolve(event.data.blob) : reject(new Error(event.data.error)));
    });
    worker.addEventListener("error", (event) => finish(() => reject(new Error(event.message || "Export worker ไม่ตอบสนอง"))));
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage(request, transfer);
  });
}

export class WorkerExportPackagingAdapter implements ExportPackagingAdapter {
  readonly execution = "worker" as const;

  createZip(entries: ArchiveEntry[], signal?: AbortSignal): Promise<Blob> {
    const transferableEntries = entries.map((entry) => ({ name: entry.name, data: new Uint8Array(entry.data) }));
    const request: PackagingWorkerRequest = { id: crypto.randomUUID(), operation: "zip", entries: transferableEntries };
    return runPackagingWorker(request, transferableEntries.map((entry) => entry.data.buffer), signal);
  }

  createPdf(pages: PdfPageInput[], signal?: AbortSignal): Promise<Blob> {
    const request: PackagingWorkerRequest = {
      id: crypto.randomUUID(),
      operation: "pdf",
      pages: pages.map(({ blob, width, height, dpi }) => ({ blob, width, height, dpi })),
    };
    return runPackagingWorker(request, [], signal);
  }
}

export class InlineExportJobRunner implements ExportJobRunner {
  readonly execution = "inline" as const;

  run(project: MangaProject, filename: string, options: ExportOptions): Promise<void> {
    return exportProject(project, filename, options);
  }
}

export class HybridWorkerExportJobRunner implements ExportJobRunner {
  readonly execution = "hybrid-worker" as const;
  private readonly packaging = new WorkerExportPackagingAdapter();

  run(project: MangaProject, filename: string, options: ExportOptions): Promise<void> {
    return exportProject(project, filename, { ...options, packagingAdapter: this.packaging });
  }
}

export const localExportJobRunner: ExportJobRunner = typeof Worker === "undefined"
  ? new InlineExportJobRunner()
  : new HybridWorkerExportJobRunner();
