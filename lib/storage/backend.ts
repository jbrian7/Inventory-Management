export type StorageBackend = "sqlite" | "google_sheets";

export function storageBackend(env: { STORAGE_BACKEND?: string } = { STORAGE_BACKEND: process.env.STORAGE_BACKEND }): StorageBackend {
  const value = (env.STORAGE_BACKEND ?? "sqlite").trim();
  if (value === "" || value === "sqlite") {
    return "sqlite";
  }
  if (value === "google_sheets") {
    return "google_sheets";
  }
  throw new Error("STORAGE_BACKEND must be sqlite or google_sheets.");
}

export function usingSheets(env?: { STORAGE_BACKEND?: string }) {
  return storageBackend(env) === "google_sheets";
}
