export const productName = "Inventory Manager";

export const businessNameFallback = "Your business";

export const qrItemPrefix = "ZAP-ITEM";

const maxBusinessNameLength = 80;

export function businessName(env?: { BUSINESS_NAME?: string }) {
  const source = env ?? process.env;
  const cleaned = (source.BUSINESS_NAME ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return businessNameFallback;
  }
  return cleaned.slice(0, maxBusinessNameLength);
}

export function documentTitle(env?: { BUSINESS_NAME?: string }) {
  return `${productName} \u00b7 ${businessName(env)}`;
}

export function itemQrPayload(id: string) {
  return `${qrItemPrefix}-${id}`;
}
