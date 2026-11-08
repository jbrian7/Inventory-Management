const maxUrlLength = 256;

export function publicBaseUrl(env?: { PUBLIC_BASE_URL?: string }): { url: string } | { error: string } {
  const raw = (env ?? process.env).PUBLIC_BASE_URL?.trim() ?? "";
  if (!raw) {
    return { error: "Set PUBLIC_BASE_URL to this deployment's public https address before printing tote labels." };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: "PUBLIC_BASE_URL must be a public https address." };
  }
  if (parsed.protocol !== "https:") {
    return { error: "PUBLIC_BASE_URL must use https." };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { error: "PUBLIC_BASE_URL must be a public https address." };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isPrivateHost(host)) {
    return { error: "PUBLIC_BASE_URL must be a public https address, not localhost or a LAN address." };
  }
  const origin = parsed.origin;
  if (origin.length > 180) {
    return { error: "PUBLIC_BASE_URL is too long." };
  }
  return { url: origin };
}

export function totePublicUrl(token: string, env?: { PUBLIC_BASE_URL?: string }) {
  const base = publicBaseUrl(env);
  if ("error" in base) {
    return base;
  }
  const url = `${base.url}/t/${token}`;
  if (url.length > maxUrlLength) {
    return { error: "The public tote address is too long to encode on a label." };
  }
  return { url };
}

export function isPrivateHost(host: string) {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  return isPrivateAddress(normalized);
}

function isPrivateAddress(host: string) {
  if (host.includes(":")) {
    const normalized = host.split("%")[0] ?? host;
    return (
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    );
  }
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) {
    return true;
  }
  return false;
}
