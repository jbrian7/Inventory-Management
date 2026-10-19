export const printerUrlKey = "zap-zone-printer-url";

export function normalizePrinterBase(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const path = parsed.pathname.replace(/\/$/, "");
  const basePath = path === "/print" ? "" : path;
  return `${parsed.origin}${basePath}`;
}

export function readPrinterBase() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(printerUrlKey) ?? "";
}

export function writePrinterBase(value: string) {
  window.localStorage.setItem(printerUrlKey, value);
}
