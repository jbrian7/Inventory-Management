export function createTransferRequestId() {
  return globalThis.crypto.randomUUID();
}

// A retry keeps the previous id only when that attempt never returned a result.
export function nextTransferRequestId(retryId: string | null, createId: () => string = createTransferRequestId) {
  if (retryId) {
    return retryId;
  }
  return createId();
}
