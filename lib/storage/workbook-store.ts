import { serializeSheets } from "@/lib/storage/mutex";
import type { Workbook } from "@/lib/storage/workbook";

export type WorkbookStore = {
  load: () => Promise<Workbook>;
  save: (book: Workbook) => Promise<void>;
};

let override: WorkbookStore | null = null;

export function setWorkbookStore(store: WorkbookStore | null) {
  override = store;
}

export function memoryStore(initial: Workbook): WorkbookStore {
  let current = initial.clone();
  return {
    async load() {
      return current.clone();
    },
    async save(book) {
      current = book.clone();
    },
  };
}

export async function activeWorkbookStore(): Promise<WorkbookStore> {
  if (override) {
    return override;
  }
  const { googleWorkbookStore } = await import("@/lib/storage/google-sheets");
  return googleWorkbookStore();
}

export async function readWorkbook() {
  const store = await activeWorkbookStore();
  return store.load();
}

export async function mutateWorkbook<T>(task: (book: Workbook) => T): Promise<T> {
  return serializeSheets(async () => {
    const store = await activeWorkbookStore();
    const draft = (await store.load()).clone();
    const result = task(draft);
    if (result && typeof result === "object" && "error" in result && (result as { error?: string }).error) {
      return result;
    }
    await store.save(draft);
    return result;
  });
}
