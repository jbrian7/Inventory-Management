import "./env";

import assert from "node:assert/strict";
import { test } from "node:test";

import { clientAddress } from "@/lib/client-address";
import { assertDevelopmentSeed } from "@/lib/dev-seed";
import { movementActorLabel } from "@/lib/movement";

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
