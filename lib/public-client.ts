import { createHmac, timingSafeEqual } from "node:crypto";

import { clientAddress, trustProxyEnabled } from "@/lib/client-address";

const peerPattern = /^[0-9a-f:.]+$/i;

export function normalizePeerAddress(address: string) {
  let host = address.trim().toLowerCase();
  if (host.startsWith("::ffff:")) {
    host = host.slice("::ffff:".length);
  }
  if (!peerPattern.test(host) || host.length < 3 || host.length > 64) {
    return null;
  }
  return host;
}

export function stampPeer(peer: string, secret: string) {
  const normalized = normalizePeerAddress(peer);
  if (!normalized || !secret) {
    return null;
  }
  const mac = createHmac("sha256", secret).update(`peer:${normalized}`).digest("base64url");
  return `${normalized}.${mac}`;
}

export function peerFromStamp(stamp: string | null, secret: string) {
  if (!stamp || !secret) {
    return null;
  }
  const dot = stamp.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const peer = normalizePeerAddress(stamp.slice(0, dot));
  const mac = stamp.slice(dot + 1);
  if (!peer) {
    return null;
  }
  const expected = createHmac("sha256", secret).update(`peer:${peer}`).digest("base64url");
  const actual = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return null;
  }
  return peer;
}

// Public tote limits use the proxy-declared client only when TRUST_PROXY=1.
// Otherwise they use the TCP peer stamped by server.js. Forwarded headers alone never count.
export function publicClientKey(
  headerList: { get(name: string): string | null },
  env?: { TRUST_PROXY?: string; AUTH_SECRET?: string }
) {
  const source = env ?? process.env;
  const proxyEnv = { TRUST_PROXY: source.TRUST_PROXY };
  if (trustProxyEnabled(proxyEnv)) {
    const trusted = clientAddress(headerList, proxyEnv);
    if (trusted !== "local") {
      return trusted;
    }
  }
  const peer = peerFromStamp(headerList.get("x-inventory-peer"), source.AUTH_SECRET ?? "");
  if (peer) {
    return `ip:${peer}`;
  }
  return "local";
}
