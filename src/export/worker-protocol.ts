export interface WorkerArchiveEntry {
  name: string;
  data: Uint8Array;
}

export interface WorkerPdfPage {
  blob: Blob;
  width: number;
  height: number;
  dpi?: number;
}

export type PackagingWorkerRequest =
  | { id: string; operation: "zip"; entries: WorkerArchiveEntry[] }
  | { id: string; operation: "pdf"; pages: WorkerPdfPage[] };

export type PackagingWorkerResponse =
  | { id: string; ok: true; blob: Blob }
  | { id: string; ok: false; error: string };
