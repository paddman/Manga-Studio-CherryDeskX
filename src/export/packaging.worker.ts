import { createPdfDocument, createStoreZip } from "../export";
import type { PackagingWorkerRequest, PackagingWorkerResponse } from "./worker-protocol";

interface MessageWorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<PackagingWorkerRequest>) => void): void;
  postMessage(message: PackagingWorkerResponse): void;
}

const workerScope = globalThis as unknown as MessageWorkerScope;

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  void (async (): Promise<void> => {
    try {
      const blob = request.operation === "zip"
        ? createStoreZip(request.entries)
        : await createPdfDocument(request.pages);
      workerScope.postMessage({ id: request.id, ok: true, blob });
    } catch (error) {
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "Worker จัดแพ็กไฟล์ไม่สำเร็จ",
      });
    }
  })();
});
