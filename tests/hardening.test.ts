import "./env";

import assert from "node:assert/strict";
import { test } from "node:test";

import { clientAddress } from "@/lib/client-address";
import { assertDevelopmentSeed } from "@/lib/dev-seed";
import { movementActorLabel } from "@/lib/movement";
import { publicClientKey, stampPeer } from "@/lib/public-client";
import { sessionCookieSecure } from "@/lib/session";

function headers(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

test("forwarded addresses are ignored unless the proxy is trusted", () => {
  const list = headers({
    "x-forwarded-for": "1.2.3.4, 10.0.0.8",
    "x-real-ip": "10.0.0.9",
  });
  assert.equal(clientAddress(list, {}), "local");
  assert.equal(clientAddress(list, { TRUST_PROXY: "1" }), "ip:10.0.0.8");
  assert.equal(
    clientAddress(headers({ "x-real-ip": "10.1.1.5" }), { TRUST_PROXY: "1" }),
    "ip:10.1.1.5"
  );
  assert.equal(
    clientAddress(headers({ "x-forwarded-for": "not an address" }), { TRUST_PROXY: "1" }),
    "local"
  );
});

test("sign-in cookies stay secure on public production and work on a private HTTP host", () => {
  assert.equal(
    sessionCookieSecure({ nodeEnv: "production", host: "inventory.example.com" }),
    true
  );
  assert.equal(
    sessionCookieSecure({
      nodeEnv: "production",
      trustProxy: "1",
      forwardedProto: "https",
      host: "inventory.example.com",
    }),
    true
  );
  assert.equal(sessionCookieSecure({ nodeEnv: "production", host: "192.168.1.20:3000" }), false);
  assert.equal(sessionCookieSecure({ nodeEnv: "production", host: "localhost:3000" }), false);
  assert.equal(sessionCookieSecure({ nodeEnv: "development", host: "localhost:3000" }), false);
  assert.equal(
    sessionCookieSecure({ nodeEnv: "production", host: "inventory.example.com", cookieSecure: "0" }),
    false
  );
  assert.equal(sessionCookieSecure({ nodeEnv: "development", host: "localhost", cookieSecure: "1" }), true);
  assert.equal(
    sessionCookieSecure({
      nodeEnv: "production",
      trustProxy: "1",
      forwardedProto: "http",
      host: "10.0.0.8:3000",
    }),
    false
  );
});

test("login limits follow the signed peer instead of one shared local key", () => {
  const secret = "test-auth-secret-0123456789";
  const phone = stampPeer("192.168.1.20", secret);
  const tablet = stampPeer("192.168.1.21", secret);
  assert.ok(phone && tablet);
  const env = { AUTH_SECRET: secret };
  assert.equal(
    publicClientKey(headers({ "x-inventory-peer": phone, "x-forwarded-for": "1.2.3.4" }), env),
    "ip:192.168.1.20"
  );
  assert.equal(publicClientKey(headers({ "x-inventory-peer": tablet }), env), "ip:192.168.1.21");
  assert.notEqual(
    publicClientKey(headers({ "x-inventory-peer": phone }), env),
    publicClientKey(headers({ "x-inventory-peer": tablet }), env)
  );
  assert.equal(publicClientKey(headers({ "x-forwarded-for": "1.2.3.4" }), env), "local");
});

test("the development seed refuses production and an unmarked run", () => {
  assert.throws(
    () => assertDevelopmentSeed({ NODE_ENV: "production", ZAP_ALLOW_SEED: "1" }),
    /production/
  );
  assert.throws(() => assertDevelopmentSeed({ NODE_ENV: "development" }), /ZAP_ALLOW_SEED/);
  assert.doesNotThrow(() =>
    assertDevelopmentSeed({ NODE_ENV: "development", ZAP_ALLOW_SEED: "1" })
  );
});

test("a stored actor name outranks a later rename and a missing user", () => {
  assert.equal(
    movementActorLabel({ actorName: "Casey", user: { name: "Casey Renamed" } }),
    "Casey"
  );
  assert.equal(movementActorLabel({ actorName: null, user: null }), "Unknown");
  assert.equal(movementActorLabel({ name: "Haven" }), "Haven");
  assert.equal(movementActorLabel(null), "Unknown");
});
