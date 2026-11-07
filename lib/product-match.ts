export function suggestProducts<T extends { name: string; sku: string; barcode?: string | null }>(items: T[], query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) {
    return [];
  }
  return items
    .filter((item) => {
      const barcode = item.barcode?.toLowerCase() ?? "";
      return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle) || barcode.includes(needle);
    })
    .slice(0, 8);
}
