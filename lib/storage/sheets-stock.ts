import { randomBytes } from "node:crypto";

import { inventoryAccessError, scanAccessError, type AccessUser } from "@/lib/access";
import { itemQrPayload } from "@/lib/brand";
import {
  generateSku,
  intakeFingerprint,
  type IntakeLine,
  type IntakeResult,
} from "@/lib/intake";
import { totalQuantity } from "@/lib/balances";
import { lifecycleOf } from "@/lib/lifecycle";
import { parseAmount, parseRequestId } from "@/lib/stock";
import { publicScanLimit, publicScanWindowMs } from "@/lib/public-scan-limit";
import { loginFailureLimit, loginWindowMs } from "@/lib/login-throttle";
import { mutateWorkbook, readWorkbook } from "@/lib/storage/workbook-store";
import type { Workbook, Row } from "@/lib/storage/workbook";

const generalCategory = "General";

class StockRejected extends Error {}

type Actor = (AccessUser & { id?: string }) | null;

function cleanText(value: string | null | undefined, max: number) {
  const text = (value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > max) {
    return null;
  }
  return text;
}

function nowIso() {
  return new Date().toISOString();
}

function flag(value: string | undefined) {
  return value === "1" || value === "true";
}

function quantityOf(row: Row | null) {
  const quantity = Number(row?.quantity ?? "0");
  return Number.isInteger(quantity) ? quantity : 0;
}

function balanceRow(book: Workbook, itemId: string, locationId: string) {
  return book.rows("Balances").find((row) => row.itemId === itemId && row.locationId === locationId) ?? null;
}

function setBalance(book: Workbook, itemId: string, locationId: string, quantity: number) {
  const current = balanceRow(book, itemId, locationId);
  if (!current) {
    book.insert("Balances", {
      id: `bal_${randomBytes(8).toString("hex")}`,
      itemId,
      locationId,
      quantity: String(quantity),
    });
    return;
  }
  book.replace("Balances", current.id, { quantity: String(quantity) });
}

function itemBalances(book: Workbook, itemId: string) {
  return book
    .rows("Balances")
    .filter((row) => row.itemId === itemId)
    .map((row) => ({ quantity: quantityOf(row) }));
}

function addHistory(book: Workbook, row: Row) {
  book.insert("History", {
    id: `hist_${randomBytes(8).toString("hex")}`,
    userId: "",
    actorName: "",
    quantityBefore: "",
    quantityAfter: "",
    locationName: "",
    fromLocationName: "",
    toLocationName: "",
    sourceQuantityBefore: "",
    sourceQuantityAfter: "",
    destinationQuantityBefore: "",
    destinationQuantityAfter: "",
    reason: "",
    requestId: "",
    timestamp: nowIso(),
    ...row,
  });
}

function actorName(book: Workbook, userId: string) {
  return book.find("Users", "id", userId)?.name.trim() || "Unknown";
}

function priorReceipt(book: Workbook, requestId: string, fingerprint: string) {
  const prior = book.rows("Receipts").find((row) => row.requestId === requestId);
  if (!prior) {
    return null;
  }
  if (prior.fingerprint !== fingerprint) {
    throw new StockRejected("That request was already used for a different receipt.");
  }
  return { saved: true as const, lines: [] };
}

function saveReceipt(book: Workbook, requestId: string, fingerprint: string, userId: string, name: string) {
  book.insert("Receipts", {
    id: `rcpt_${randomBytes(8).toString("hex")}`,
    requestId,
    fingerprint,
    userId,
    actorName: name,
    createdAt: nowIso(),
  });
}

export function applyReceive(book: Workbook, user: Actor, lines: IntakeLine[], requestId: unknown): IntakeResult {
  const denied = scanAccessError(user);
  if (denied) {
    return { error: denied };
  }
  if (!user?.id) {
    return { error: "Sign in to scan." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this receipt again." };
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 40) {
    return { error: "Add at least one product." };
  }
  const fingerprint = intakeFingerprint(lines);
  for (const line of lines) {
    if (!line.locationId?.trim()) {
      return { error: "Choose a destination." };
    }
    if (parseAmount(line.quantity) === null) {
      return { error: "Enter a whole number of 1 or more." };
    }
    const creating = line.createNew === true;
    const existing = Boolean(line.itemId?.trim());
    if (creating === existing) {
      return { error: "Choose an existing product or create a new one." };
    }
    if (creating && inventoryAccessError(user, "add")) {
      return { error: "Only admins and managers can add items." };
    }
    if (creating && !cleanText(line.name, 80)) {
      return { error: "Enter a product name." };
    }
  }
  const replay = priorReceipt(book, submission, fingerprint);
  if (replay) {
    return replay;
  }
  const name = actorName(book, user.id);
  const saved: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const location = book.find("Locations", "id", line.locationId.trim());
    if (!location) {
      throw new StockRejected("Choose a destination that exists.");
    }
    const received = line.createNew
      ? createItem(book, line, user.id, name, submission, index, location.name)
      : addItem(book, line, user.id, name, submission, index, location.name);
    saved.push({ ...received, locationName: location.name });
  }
  saveReceipt(book, submission, fingerprint, user.id, name);
  return { saved: true, lines: saved };
}

function addItem(
  book: Workbook,
  line: IntakeLine,
  userId: string,
  name: string,
  requestId: string,
  index: number,
  locationName: string
) {
  const item = book.find("Items", "id", line.itemId!.trim());
  if (!item || item.archivedAt) {
    throw new StockRejected("Choose a product that is still in the catalog.");
  }
  const current = balanceRow(book, item.id, line.locationId.trim());
  const before = quantityOf(current);
  setBalance(book, item.id, line.locationId.trim(), before + line.quantity);
  addHistory(book, {
    itemId: item.id,
    userId,
    actorName: name,
    action: "ADD",
    amount: String(line.quantity),
    quantityBefore: String(before),
    quantityAfter: String(before + line.quantity),
    locationName,
    requestId: `${requestId}-${index}`,
    reason: "Received",
  });
  return { itemId: item.id, name: item.name, sku: item.sku, quantity: line.quantity };
}

function createItem(
  book: Workbook,
  line: IntakeLine,
  userId: string,
  actor: string,
  requestId: string,
  index: number,
  locationName: string
) {
  const name = cleanText(line.name, 80);
  if (!name) {
    throw new StockRejected("Enter a product name.");
  }
  const description = cleanText(line.description, 200) || "";
  const barcode = cleanText(line.barcode, 80) || "";
  const requestedSku = cleanText(line.sku, 40) || "";
  const categoryName = cleanText(line.categoryName, 80) || generalCategory;
  let category = book.rows("Categories").find((row) => row.name === categoryName);
  if (!category) {
    category = { id: `cat_${randomBytes(6).toString("hex")}`, name: categoryName };
    book.insert("Categories", category);
  }
  const id = `in_${randomBytes(12).toString("hex")}`;
  let sku = requestedSku || generateSku();
  for (let attempt = 0; attempt < 5 && book.find("Items", "sku", sku); attempt += 1) {
    sku = generateSku();
  }
  if (book.find("Items", "sku", sku)) {
    throw new StockRejected("Could not create a unique SKU.");
  }
  if (barcode && book.find("Items", "barcode", barcode)) {
    throw new StockRejected("That barcode is already in use.");
  }
  const stamp = nowIso();
  book.insert("Items", {
    id,
    name,
    sku,
    description,
    threshold: "0",
    categoryId: category.id,
    qrCodeData: itemQrPayload(id),
    barcode,
    isManualOos: "0",
    archivedAt: "",
    createdAt: stamp,
    updatedAt: stamp,
  });
  setBalance(book, id, line.locationId.trim(), line.quantity);
  addHistory(book, {
    itemId: id,
    userId,
    actorName: actor,
    action: "NEW_ITEM",
    amount: String(line.quantity),
    quantityBefore: "0",
    quantityAfter: String(line.quantity),
    locationName,
    requestId: `${requestId}-${index}`,
    reason: "Received",
  });
  return { itemId: id, name, sku, quantity: line.quantity };
}

export function applyRemove(book: Workbook, user: Actor, lines: IntakeLine[], requestId: unknown): IntakeResult {
  const denied = scanAccessError(user);
  if (denied || !user?.id) {
    return { error: denied || "Sign in to scan." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this removal again." };
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 40) {
    return { error: "Choose at least one product." };
  }
  const normalized = lines.map((line) => ({ ...line, createNew: false }));
  const fingerprint = intakeFingerprint(normalized);
  for (const line of normalized) {
    if (!line.itemId?.trim() || !line.locationId?.trim() || parseAmount(line.quantity) === null) {
      return { error: "Choose a product, a place, and a whole number of 1 or more." };
    }
  }
  const replay = priorReceipt(book, submission, fingerprint);
  if (replay) {
    return replay;
  }
  const name = actorName(book, user.id);
  const saved: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const line = normalized[index]!;
    const location = book.find("Locations", "id", line.locationId.trim());
    const item = book.find("Items", "id", line.itemId!.trim());
    if (!location || !item) {
      throw new StockRejected("Choose a product and place that exist.");
    }
    const before = quantityOf(balanceRow(book, item.id, location.id));
    if (before < line.quantity) {
      throw new StockRejected(`Only ${before} ${item.name} in ${location.name}.`);
    }
    setBalance(book, item.id, location.id, before - line.quantity);
    addHistory(book, {
      itemId: item.id,
      userId: user.id,
      actorName: name,
      action: "REMOVE",
      amount: String(line.quantity),
      quantityBefore: String(before),
      quantityAfter: String(before - line.quantity),
      locationName: location.name,
      requestId: `${submission}-${index}`,
      reason: "Removed",
    });
    saved.push({ itemId: item.id, name: item.name, sku: item.sku, quantity: line.quantity, locationName: location.name });
  }
  saveReceipt(book, submission, fingerprint, user.id, name);
  return { saved: true, lines: saved };
}

export function applyMove(
  book: Workbook,
  user: Actor,
  lines: (IntakeLine & { toLocationId: string })[],
  requestId: unknown
): IntakeResult {
  const denied = scanAccessError(user);
  if (denied || !user?.id) {
    return { error: denied || "Sign in to scan." };
  }
  const submission = parseRequestId(requestId);
  if (!submission) {
    return { error: "Submit this move again." };
  }
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 40) {
    return { error: "Choose at least one product." };
  }
  const fingerprint = intakeFingerprint(lines.map((line) => ({ ...line, name: line.toLocationId, createNew: false })));
  for (const line of lines) {
    if (!line.itemId?.trim() || !line.locationId?.trim() || !line.toLocationId?.trim()) {
      return { error: "Choose a product and two places." };
    }
    if (line.locationId.trim() === line.toLocationId.trim()) {
      return { error: "Choose two different places." };
    }
    if (parseAmount(line.quantity) === null) {
      return { error: "Enter a whole number of 1 or more." };
    }
  }
  const replay = priorReceipt(book, submission, fingerprint);
  if (replay) {
    return replay;
  }
  const name = actorName(book, user.id);
  const saved: { itemId: string; name: string; sku: string; quantity: number; locationName: string }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const from = book.find("Locations", "id", line.locationId.trim());
    const to = book.find("Locations", "id", line.toLocationId.trim());
    const item = book.find("Items", "id", line.itemId!.trim());
    if (!from || !to || !item) {
      throw new StockRejected("Choose a product and places that exist.");
    }
    const before = quantityOf(balanceRow(book, item.id, from.id));
    if (before < line.quantity) {
      throw new StockRejected(`Only ${before} ${item.name} in ${from.name}.`);
    }
    const destBefore = quantityOf(balanceRow(book, item.id, to.id));
    const total = totalQuantity(itemBalances(book, item.id));
    setBalance(book, item.id, from.id, before - line.quantity);
    setBalance(book, item.id, to.id, destBefore + line.quantity);
    addHistory(book, {
      itemId: item.id,
      userId: user.id,
      actorName: name,
      action: "TRANSFER",
      amount: String(line.quantity),
      quantityBefore: String(total),
      quantityAfter: String(total),
      fromLocationName: from.name,
      toLocationName: to.name,
      sourceQuantityBefore: String(before),
      sourceQuantityAfter: String(before - line.quantity),
      destinationQuantityBefore: String(destBefore),
      destinationQuantityAfter: String(destBefore + line.quantity),
      requestId: `${submission}-${index}`,
      reason: "Moved",
    });
    saved.push({
      itemId: item.id,
      name: item.name,
      sku: item.sku,
      quantity: line.quantity,
      locationName: `${from.name} → ${to.name}`,
    });
  }
  saveReceipt(book, submission, fingerprint, user.id, name);
  return { saved: true, lines: saved };
}

export function applyArchive(book: Workbook, user: Actor, ids: string[]) {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length < 1) {
    return { error: "Choose a product to archive." };
  }
  for (const id of unique) {
    const item = book.find("Items", "id", id);
    if (!item) {
      throw new StockRejected("Choose a product that exists.");
    }
    if (item.archivedAt) {
      continue;
    }
    if (totalQuantity(itemBalances(book, id)) > 0) {
      throw new StockRejected(`${item.name} still has stock. Deplete it before archiving.`);
    }
    book.replace("Items", id, { archivedAt: nowIso(), updatedAt: nowIso() });
  }
  return { saved: true as const, count: unique.length };
}

export function applyRestore(book: Workbook, user: Actor, ids: string[]) {
  const denied = inventoryAccessError(user, "edit");
  if (denied) {
    return { error: denied };
  }
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length < 1) {
    return { error: "Choose a product to restore." };
  }
  for (const id of unique) {
    if (!book.find("Items", "id", id)) {
      throw new StockRejected("Choose a product that exists.");
    }
    book.replace("Items", id, { archivedAt: "", updatedAt: nowIso() });
  }
  return { saved: true as const, count: unique.length };
}

export function sheetUserByLookup(book: Workbook, lookup: string) {
  const user = book.find("Users", "pinLookup", lookup);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    sessionVersion: Number(user.sessionVersion || "0"),
    active: flag(user.active),
    canScan: flag(user.canScan),
    pinHash: user.pinHash,
    pinLookup: user.pinLookup,
  };
}

export function sheetUserById(book: Workbook, id: string) {
  const user = book.find("Users", "id", id);
  if (!user) {
    return null;
  }
  return sheetUserByLookup(book, user.pinLookup);
}

export function catalogFromBook(book: Workbook) {
  const categories = new Map(book.rows("Categories").map((row) => [row.id, row.name]));
  const locations = new Map(book.rows("Locations").map((row) => [row.id, row.name]));
  return book.rows("Items").map((item) => {
    const balances = book
      .rows("Balances")
      .filter((row) => row.itemId === item.id)
      .map((row) => ({
        locationId: row.locationId,
        name: locations.get(row.locationId) ?? "Unknown",
        quantity: quantityOf(row),
      }));
    const quantity = totalQuantity(balances);
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: item.description,
      threshold: Number(item.threshold || "0"),
      categoryId: item.categoryId,
      categoryName: categories.get(item.categoryId) ?? "General",
      qrCodeData: item.qrCodeData,
      barcode: item.barcode || null,
      isManualOos: flag(item.isManualOos),
      archivedAt: item.archivedAt || null,
      quantity,
      lifecycle: lifecycleOf({ archivedAt: item.archivedAt || null, quantity }),
      balances,
    };
  });
}

export function historyFromBook(book: Workbook) {
  return book
    .rows("History")
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemName: book.find("Items", "id", row.itemId)?.name ?? "Unknown",
      action: row.action,
      amount: Number(row.amount || "0"),
      actorName: row.actorName,
      reason: row.reason,
      locationName: row.locationName,
      fromLocationName: row.fromLocationName,
      toLocationName: row.toLocationName,
      timestamp: row.timestamp,
    }))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id));
}

export function publicToteFromBook(book: Workbook, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }
  const tote = book.rows("Totes").find((row) => row.publicToken === token);
  if (!tote || !flag(tote.publicEnabled)) {
    return null;
  }
  const items = book
    .rows("Balances")
    .filter((row) => row.locationId === tote.locationId && quantityOf(row) > 0)
    .map((row) => ({
      name: book.find("Items", "id", row.itemId)?.name ?? "Unknown",
      quantity: quantityOf(row),
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || right.quantity - left.quantity);
  return {
    businessName: "",
    name: tote.name,
    storageLabel: tote.storageLabel || null,
    items,
    distinct: items.length,
    pieces: totalQuantity(items),
  };
}

export function consumeSheetLogin(book: Workbook, key: string, now = new Date()) {
  const cutoff = now.getTime() - loginWindowMs;
  const row = book.rows("LoginThrottle").find((entry) => entry.key === key);
  const windowStart = row ? Date.parse(row.windowStart) : now.getTime();
  const fresh = !row || windowStart <= cutoff;
  const failures = fresh ? 1 : Number(row?.failures || "0") + 1;
  const lockedUntil = failures >= loginFailureLimit ? new Date(now.getTime() + loginWindowMs).toISOString() : "";
  const next = {
    key,
    failures: String(failures),
    windowStart: fresh ? now.toISOString() : row?.windowStart || now.toISOString(),
    lockedUntil,
  };
  if (!row) {
    book.insert("LoginThrottle", next);
  } else {
    book.updateWhere("LoginThrottle", "key", row.key, next);
  }
  return Boolean(lockedUntil);
}

export function sheetLoginLocked(book: Workbook, key: string, now = new Date()) {
  const row = book.rows("LoginThrottle").find((entry) => entry.key === key);
  return Boolean(row?.lockedUntil && Date.parse(row.lockedUntil) > now.getTime());
}

export function clearSheetLogin(book: Workbook, key: string) {
  const row = book.rows("LoginThrottle").find((entry) => entry.key === key);
  if (row) {
    book.updateWhere("LoginThrottle", "key", key, {
      failures: "0",
      lockedUntil: "",
      windowStart: new Date().toISOString(),
    });
  }
}

async function commit<T>(task: (book: Workbook) => T): Promise<T> {
  return mutateWorkbook((book) => {
    try {
      return task(book);
    } catch (error) {
      if (error instanceof StockRejected) {
        return { error: error.message } as T;
      }
      throw error;
    }
  });
}

export function receiveOnSheets(user: Actor, lines: IntakeLine[], requestId: unknown) {
  return commit((book) => applyReceive(book, user, lines, requestId));
}

export function removeOnSheets(user: Actor, lines: IntakeLine[], requestId: unknown) {
  return commit((book) => applyRemove(book, user, lines, requestId));
}

export function moveOnSheets(user: Actor, lines: (IntakeLine & { toLocationId: string })[], requestId: unknown) {
  return commit((book) => applyMove(book, user, lines, requestId));
}

export function archiveOnSheets(user: Actor, ids: string[]) {
  return commit((book) => applyArchive(book, user, ids));
}

export function restoreOnSheets(user: Actor, ids: string[]) {
  return commit((book) => applyRestore(book, user, ids));
}

export async function readSheetUserByLookup(lookup: string) {
  return sheetUserByLookup(await readWorkbook(), lookup);
}

export async function readSheetUserById(id: string) {
  return sheetUserById(await readWorkbook(), id);
}

export async function readSheetCatalog() {
  return catalogFromBook(await readWorkbook());
}

export async function readSheetWorkspace() {
  const book = await readWorkbook();
  return {
    items: catalogFromBook(book),
    categories: book.rows("Categories").map((row) => ({ id: row.id, name: row.name })),
    locations: book.rows("Locations").map((row) => ({ id: row.id, name: row.name })),
    totes: book.rows("Totes").map((row) => ({ name: row.name, locationId: row.locationId })),
  };
}

export async function readSheetHistory() {
  return historyFromBook(await readWorkbook());
}

export async function readSheetPublicTote(token: string) {
  return publicToteFromBook(await readWorkbook(), token);
}

export async function sheetsLoginIsLocked(key: string, now = new Date()) {
  return sheetLoginLocked(await readWorkbook(), key, now);
}

export async function sheetsRecordLoginFailure(key: string, now = new Date()) {
  await commit((book) => {
    consumeSheetLogin(book, key, now);
    return { saved: true as const };
  });
}

export async function sheetsClearLogin(key: string) {
  await commit((book) => {
    clearSheetLogin(book, key);
    return { saved: true as const };
  });
}

export async function sheetsConsumeScan(key: string, now = new Date()) {
  let limited = false;
  await commit((book) => {
    limited = consumeSheetScan(book, key, now);
    return { saved: true as const };
  });
  return limited;
}

export function consumeSheetScan(book: Workbook, key: string, now = new Date()) {
  const cutoff = now.getTime() - publicScanWindowMs;
  const row = book.rows("PublicScans").find((entry) => entry.key === key);
  const fresh = !row || Date.parse(row.windowStart) <= cutoff;
  const hits = fresh ? 1 : Number(row?.hits || "0") + 1;
  const next = { key, hits: String(hits), windowStart: fresh ? now.toISOString() : row?.windowStart || now.toISOString() };
  if (!row) {
    book.insert("PublicScans", next);
  } else {
    book.updateWhere("PublicScans", "key", key, next);
  }
  return hits > publicScanLimit;
}
