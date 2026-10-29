import { escapeHtml } from "@/lib/html-text";
import type { PublicToteView } from "@/lib/tote";

const pageStyle = `
  body { margin: 0; font-family: system-ui, sans-serif; color: #111; background: #fff; }
  main { max-width: 32rem; margin: 0 auto; padding: 1.5rem 1.25rem 2.5rem; }
  p { margin: 0; }
  h1 { margin: 0.35rem 0 0; font-size: 1.875rem; line-height: 1.2; }
  .muted { margin-top: 0.35rem; color: #52525b; }
  .summary { margin: 1rem 0; font-size: 0.95rem; }
  ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid #e4e4e7; }
  li { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; padding: 0.85rem 0; border-bottom: 1px solid #e4e4e7; }
  .qty { font-size: 1.5rem; font-weight: 650; font-variant-numeric: tabular-nums; }
`;

function documentFor(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <style>${pageStyle}</style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

export function renderPublicMissing() {
  return documentFor("Tote link", "<h1>This tote link is not available.</h1>");
}

export function renderPublicLimited() {
  return documentFor("Tote link", "<h1>Too many requests. Try again shortly.</h1>");
}

export function renderPublicTotePage(view: Omit<PublicToteView, "businessName"> & { businessName: string }) {
  const storage = view.storageLabel
    ? `<p class="muted">${escapeHtml(view.storageLabel)}</p>`
    : "";
  const summary = `${view.distinct} ${view.distinct === 1 ? "item" : "items"} · ${view.pieces} ${view.pieces === 1 ? "piece" : "pieces"}`;
  const list =
    view.items.length === 0
      ? `<p class="summary">This tote is empty.</p>`
      : `<p class="summary">${escapeHtml(summary)}</p><ul>${view.items
          .map(
            (item) =>
              `<li><span>${escapeHtml(item.name)}</span><span class="qty">${item.quantity}</span></li>`
          )
          .join("")}</ul>`;
  return documentFor(
    `${view.businessName} · ${view.name}`,
    `<p>${escapeHtml(view.businessName)}</p><h1>${escapeHtml(view.name)}</h1>${storage}${list}`
  );
}

export const publicToteHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
