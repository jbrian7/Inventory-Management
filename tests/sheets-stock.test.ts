import "./env";

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { after, before, test } from "node:test";

import { authenticatePin } from "@/lib/authenticate-pin";
import { archiveItems, moveStock, receiveStock, removeStock, restoreItems } from "@/lib/intake";
import { pinCredential } from "@/lib/pin";
import { clearGoogleTokenCache, readServiceAccount, serviceAccountAssertion } from "@/lib/storage/google-sheets";
import { catalogFromBook } from "@/lib/storage/sheets-stock";
import { memoryStore, setWorkbookStore } from "@/lib/storage/workbook-store";
import { Workbook } from "@/lib/storage/workbook";
import { refuseLiveWrite } from "../scripts/storage-copy";

const manager = { id: "user-manager", role: "MANAGER", active: true, canScan: true };
const staff = { id: "user-staff", role: "STAFF", active: true, canScan: true };
let storeBook = Workbook.empty();

before(() => {
  process.env.STORAGE_BACKEND = "google_sheets";
  storeBook = Workbook.empty();
  storeBook.insert("Users", {
    id: manager.id,
    name: "Jenny",
    role: "MANAGER",
    canScan: "1",
    active: "1",
    sessionVersion: "0",
    ...pinCredential("2468"),
  });
  storeBook.insert("Users", {
    id: staff.id,
    name: "Haven",
    role: "STAFF",
    canScan: "1",
    active: "1",
    sessionVersion: "0",
    ...pinCredential("1357"),
  });
  storeBook.insert("Locations", { id: "loc-bin", name: "Floor bin" });
  storeBook.insert("Locations", { id: "loc-counter", name: "Counter" });
  setWorkbookStore(memoryStore(storeBook));
});

after(() => {
  setWorkbookStore(null);
  delete process.env.STORAGE_BACKEND;
});

test("quick intake creates a product, ignores a duplicate request, and keeps the QR", async () => {
  const created = await receiveStock(
    manager,
    [{ createNew: true, name: "Party poppers", quantity: 4, locationId: "loc-bin" }],
    "sheet-new-0001"
  );
  assert.equal("saved" in created && created.lines.length, 1);
  const again = await receiveStock(
    manager,
    [{ createNew: true, name: "Party poppers", quantity: 4, locationId: "loc-bin" }],
    "sheet-new-0001"
  );
  assert.equal("saved" in again && again.saved, true);
  const book = await (await import("@/lib/storage/workbook-store")).readWorkbook();
  const item = book.find("Items", "name", "Party poppers");
  assert.ok(item);
  assert.match(item.sku, /^IN-/);
  assert.equal(item.qrCodeData, `ZAP-ITEM-${item.id}`);
  assert.equal(item.threshold, "0");
  const balance = book.rows("Balances").find((row) => row.itemId === item.id);
  assert.equal(balance?.quantity, "4");
  assert.equal(book.rows("Items").filter((row) => row.name === "Party poppers").length, 1);
  const roundTrip = Workbook.fromGrids(book.toGrids());
  assert.equal(roundTrip.find("Items", "id", item.id)?.qrCodeData, item.qrCodeData);
});

test("sheets stock can move, refuse a negative balance, deplete, archive, and restore", async () => {
  const book = await (await import("@/lib/storage/workbook-store")).readWorkbook();
  const item = book.find("Items", "name", "Party poppers");
  assert.ok(item);
  const moved = await moveStock(
    staff,
    [{ itemId: item.id, quantity: 1, locationId: "loc-bin", toLocationId: "loc-counter" }],
    "sheet-move-0001"
  );
  assert.equal("saved" in moved && moved.saved, true);
  const over = await removeStock(staff, [{ itemId: item.id, quantity: 9, locationId: "loc-bin" }], "sheet-over-0001");
  assert.match("error" in over ? over.error : "", /Only 3/);
  const removedBin = await removeStock(staff, [{ itemId: item.id, quantity: 3, locationId: "loc-bin" }], "sheet-rem-bin01");
  const removedCounter = await removeStock(
    staff,
    [{ itemId: item.id, quantity: 1, locationId: "loc-counter" }],
    "sheet-rem-ctr01"
  );
  assert.equal("saved" in removedBin && removedBin.saved, true);
  assert.equal("saved" in removedCounter && removedCounter.saved, true);
  const depleted = catalogFromBook(await (await import("@/lib/storage/workbook-store")).readWorkbook()).find(
    (row) => row.id === item.id
  );
  assert.equal(depleted?.lifecycle, "DEPLETED");
  assert.equal(depleted?.quantity, 0);
  const blocked = await archiveItems(staff, [item.id]);
  assert.match("error" in blocked ? blocked.error ?? "" : "", /admins and managers/);
  const archived = await archiveItems(manager, [item.id]);
  assert.equal("saved" in archived && archived.saved, true);
  const stocked = await receiveStock(staff, [{ itemId: item.id, quantity: 1, locationId: "loc-bin" }], "sheet-add-arch1");
  assert.match("error" in stocked ? stocked.error : "", /still in the catalog/);
  const restored = await restoreItems(manager, [item.id]);
  assert.equal("saved" in restored && restored.saved, true);
  const history = (await (await import("@/lib/storage/workbook-store")).readWorkbook()).rows("History");
  assert.ok(history.some((row) => row.action === "NEW_ITEM" && row.itemId === item.id));
  assert.ok(history.some((row) => row.action === "TRANSFER" && row.quantityBefore === row.quantityAfter));
});

test("serialized sheet writes cannot overspend one balance", async () => {
  const created = await receiveStock(
    manager,
    [{ createNew: true, name: "Tokens", quantity: 4, locationId: "loc-bin" }],
    "sheet-token-001"
  );
  assert.equal("saved" in created && created.saved, true);
  const book = await (await import("@/lib/storage/workbook-store")).readWorkbook();
  const item = book.find("Items", "name", "Tokens");
  assert.ok(item);
  const results = await Promise.all([
    removeStock(staff, [{ itemId: item.id, quantity: 3, locationId: "loc-bin" }], "sheet-race-0001"),
    removeStock(staff, [{ itemId: item.id, quantity: 3, locationId: "loc-bin" }], "sheet-race-0002"),
  ]);
  const successes = results.filter((result) => "saved" in result && result.saved && result.lines.length === 1);
  assert.equal(successes.length, 1);
  const balance = (await (await import("@/lib/storage/workbook-store")).readWorkbook())
    .rows("Balances")
    .find((row) => row.itemId === item.id && row.locationId === "loc-bin");
  assert.equal(balance?.quantity, "1");
});

test("a spreadsheet user can sign in without a SQLite user table", async () => {
  const signedIn = await authenticatePin("2468", "sheet-login");
  assert.equal("user" in signedIn && signedIn.user.name, "Jenny");
  const missing = await authenticatePin("0000", "sheet-login-miss");
  assert.equal("error" in missing && missing.error, "That PIN is not recognized.");
});

test("the Google token request does not send the private key", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const assertion = serviceAccountAssertion({ client_email: "sheets@example.iam.gserviceaccount.com", private_key: pem }, 1_700_000_000);
  assert.equal(assertion.includes(pem), false);
  assert.equal(assertion.split(".").length, 3);
  clearGoogleTokenCache();
  let body = "";
  const fetchImpl: typeof fetch = async (_url, init) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }), { status: 200 });
  };
  process.env.SPREADSHEET_ID = "sheet-test";
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "sheets@example.iam.gserviceaccount.com",
    private_key: pem,
  });
  const { googleWorkbookStore } = await import("@/lib/storage/google-sheets");
  const store = googleWorkbookStore(process.env, async (url, init) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return fetchImpl(url, init);
    }
    return new Response(JSON.stringify({ valueRanges: [] }), { status: 200 });
  });
  await store.load();
  assert.equal(body.includes("PRIVATE KEY"), false);
  assert.equal(body.includes(pem), false);
  delete process.env.SPREADSHEET_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  clearGoogleTokenCache();
  assert.throws(() => readServiceAccount({ GOOGLE_SERVICE_ACCOUNT_JSON: "" }), /GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.throws(() => refuseLiveWrite(`${process.cwd()}/dev.db`), /dev\.db/);
});
