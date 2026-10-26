const addressPattern = /^[0-9a-f:.]+$/i;

export function trustProxyEnabled(env?: { TRUST_PROXY?: string }) {
  return (env ?? process.env).TRUST_PROXY === "1";
}

export function clientAddress(
  headerList: { get(name: string): string | null },
  env?: { TRUST_PROXY?: string }
) {
  if (!trustProxyEnabled(env)) {
    return "local";
  }
  const forwarded = headerList.get("x-forwarded-for");
  const fromForwarded = forwarded
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  const candidate = fromForwarded || headerList.get("x-real-ip")?.trim() || "";
  if (candidate.length < 3 || candidate.length > 64 || !addressPattern.test(candidate)) {
    return "local";
  }
  return `ip:${candidate}`;
}
