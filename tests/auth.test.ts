import "./env";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { inventoryAccessError, scanAccessError } from "@/lib/access";
import { authenticatePin } from "@/lib/authenticate-pin";
import { userFromSession } from "@/lib/current-user";
import { pinCredential, verifyPin } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { buildSession, openSession, sealSession } from "@/lib/session";
import { seedMissingUsers } from "@/lib/dev-seed";
import { recordLoginFailure } from "@/lib/login-throttle";
import { movementActorLabel } from "@/lib/movement";
import { createStaffMember, removeStaffMember, updateStaffMember } from "@/lib/staff-admin";
import { adjustStock, findItemByQr } from "@/lib/stock";
import { migrateUserAuth } from "../scripts/migrate-user-auth";
import { testDatabasePath } from "./env";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testsDir, "..");

const admin = { id: "", role: "ADMIN" as const };
const manager = { id: "", role: "MANAGER" as const };

before(async () => {
  execFileSync("npx", ["prisma", "db", "push"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  const location = await prisma.location.create({ data: { name: "Stockroom" } });
  const category = await prisma.category.create({ data: { name: "Prizes" } });
  await prisma.item.create({
    data: {
      name: "Tokens",
      sku: "AT-1",
      quantity: 10,
      threshold: 5,
      qrCodeData: "ZAP-ITEM-test",
      locationId: location.id,
      categoryId: category.id,
    },
  });

  const createdAdmin = await prisma.user.create({
    data: { name: "Admin", role: "ADMIN", ...pinCredential("1001") },
  });
  const createdManager = await prisma.user.create({
    data: { name: "Manager", role: "MANAGER", ...pinCredential("2002") },
  });
  await prisma.user.create({
    data: { name: "Staff", role: "STAFF", canScan: true, ...pinCredential("3003") },
  });
  await prisma.user.create({
    data: { name: "No Scan", role: "STAFF", canScan: false, ...pinCredential("4004") },
  });
  admin.id = createdAdmin.id;
  manager.id = createdManager.id;
});

after(async () => {
  await prisma.$disconnect();
  fs.rmSync(testDatabasePath, { force: true });
});

test("migration hashes credentials and keeps inventory", () => {
  const file = path.join(os.tmpdir(), `zap-migrate-${process.pid}.db`);
  fs.rmSync(file, { force: true });
  const plainPin = "2468";
  const db = new Database(file);
  db.exec(`
    CREATE TABLE User (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STAFF',
      canScan BOOLEAN NOT NULL DEFAULT true
    );
    CREATE TABLE Item (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL
    );
    INSERT INTO Item (id, sku, quantity) VALUES ('item-1', 'BB-001', 4);
    INSERT INTO User (id, name, pin, role, canScan) VALUES ('user-1', 'Casey', '${plainPin}', 'STAFF', 1);
  `);
  db.close();

  const lines: string[] = [];
  const result = migrateUserAuth(file, (message) => lines.push(message));
  assert.equal(result.usersHashed, 1);
  assert.equal(lines.join("\n").includes(plainPin), false);

  const migrated = new Database(file);
  const userColumns = (migrated.prepare("PRAGMA table_info(User)").all() as { name: string }[]).map(
    (column) => column.name
  );
  assert.equal(userColumns.includes("pin"), false);
  assert.equal(userColumns.includes("pinHash"), true);
  const item = migrated.prepare("SELECT quantity FROM Item WHERE id = 'item-1'").get() as { quantity: number };
  assert.equal(item.quantity, 4);
  const stored = migrated.prepare("SELECT pinHash, pinLookup FROM User WHERE id = 'user-1'").get() as {
    pinHash: string;
    pinLookup: string;
  };
  assert.equal(verifyPin(plainPin, stored.pinHash), true);
  assert.equal(stored.pinLookup, pinCredential(plainPin).pinLookup);
  migrated.close();

  const again = migrateUserAuth(file, (message) => lines.push(message));
  assert.equal(again.alreadyMigrated, true);
  const source = fs.readFileSync(path.join(repoRoot, "scripts/migrate-user-auth.ts"), "utf8");
  assert.equal(source.includes("prisma/seed"), true);
  assert.equal(source.includes("1001"), false);
  fs.rmSync(file, { force: true });
});

test("staff cannot add or edit inventory, and canScan is enforced", async () => {
  const staff = { role: "STAFF", active: true, canScan: true };
  assert.match(inventoryAccessError(staff, "add") ?? "", /admins and managers/);
  assert.match(inventoryAccessError(staff, "edit") ?? "", /admins and managers/);
  assert.equal(scanAccessError(staff), null);
  assert.equal(inventoryAccessError({ role: "MANAGER", active: true, canScan: true }, "add"), null);

  const visible = await findItemByQr("ZAP-ITEM-test", staff);
  assert.equal("item" in visible && visible.item.quantity, 10);

  const blocked = await adjustStock("ZAP-ITEM-test", "REMOVE", 1, {
    role: "STAFF",
    active: true,
    canScan: false,
  });
  assert.equal("error" in blocked && blocked.error, "Scanning is turned off for this account.");
  const quantity = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-test" } });
  assert.equal(quantity.quantity, 10);

  const signedOut = await findItemByQr("ZAP-ITEM-test", null);
  assert.equal("error" in signedOut && signedOut.error, "Sign in to scan.");

  const staffActor = await prisma.user.findUniqueOrThrow({ where: { pinLookup: pinCredential("3003").pinLookup } });
  const created = await createStaffMember(
    { id: staffActor.id, role: "STAFF" },
    { name: "Extra", pin: "5555", role: "STAFF" }
  );
  assert.equal("error" in created && created.error, "Only admins and managers can change staff.");
});

test("managers cannot grant or change admin access", async () => {
  const beforeAdmin = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });

  const created = await createStaffMember(manager, { name: "New Admin", pin: "5556", role: "ADMIN" });
  assert.equal("error" in created && created.error, "Only an admin can grant admin access.");
  assert.equal(await prisma.user.count({ where: { name: "New Admin" } }), 0);

  const staff = await prisma.user.findUniqueOrThrow({ where: { pinLookup: pinCredential("3003").pinLookup } });
  const promoted = await updateStaffMember(manager, {
    id: staff.id,
    name: staff.name,
    pin: "",
    role: "ADMIN",
    active: true,
    canScan: true,
  });
  assert.equal("error" in promoted && promoted.error, "Only an admin can grant admin access.");
  const staffAfter = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
  assert.equal(staffAfter.role, "STAFF");

  const edited = await updateStaffMember(manager, {
    id: admin.id,
    name: "Taken Over",
    pin: "5557",
    role: "ADMIN",
    active: true,
    canScan: true,
  });
  assert.equal("error" in edited && edited.error, "Only an admin can change an admin.");

  const removed = await removeStaffMember(manager, admin.id);
  assert.equal("error" in removed && removed.error, "Only an admin can change an admin.");
  const afterAdmin = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  assert.equal(afterAdmin.name, beforeAdmin.name);
  assert.equal(afterAdmin.pinLookup, beforeAdmin.pinLookup);
  assert.equal(afterAdmin.role, "ADMIN");
});

test("the last admin cannot be removed, demoted, or deactivated", async () => {
  const demoted = await updateStaffMember(admin, {
    id: admin.id,
    name: "Admin",
    pin: "",
    role: "MANAGER",
    active: true,
    canScan: true,
  });
  assert.equal("error" in demoted && demoted.error, "Keep at least one admin.");

  const deactivated = await updateStaffMember(admin, {
    id: admin.id,
    name: "Admin",
    pin: "",
    role: "ADMIN",
    active: false,
    canScan: true,
  });
  assert.equal("error" in deactivated && deactivated.error, "Keep at least one admin.");

  const removed = await removeStaffMember(admin, admin.id);
  assert.equal("error" in removed && removed.error, "Keep at least one admin.");
  const stillThere = await prisma.user.findUnique({ where: { id: admin.id } });
  assert.equal(stillThere?.role, "ADMIN");
  assert.equal(stillThere?.active, true);
});

test("deleted and inactive users lose their session", async () => {
  const temporary = await prisma.user.create({
    data: { name: "Temp", role: "STAFF", ...pinCredential("5558") },
  });
  const session = buildSession(temporary);
  assert.ok(session);
  assert.ok(await userFromSession(session));

  await prisma.user.update({ where: { id: temporary.id }, data: { active: false } });
  assert.equal(await userFromSession(session), null);
  const inactiveLogin = await authenticatePin("5558", "inactive-user");
  assert.equal("error" in inactiveLogin && inactiveLogin.error, "That PIN is not recognized.");

  await prisma.user.delete({ where: { id: temporary.id } });
  assert.equal(await userFromSession(session), null);
});

test("incorrect PINs are throttled, then a later correct PIN works", async () => {
  const key = "tablet-test";
  const start = new Date("2026-10-22T12:00:00.000Z");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await authenticatePin("9999", key, new Date(start.getTime() + attempt * 1000));
    assert.equal("error" in failed && failed.error, "That PIN is not recognized.");
  }
  const locked = await authenticatePin("1001", key, new Date(start.getTime() + 6000));
  assert.equal("error" in locked && locked.error, "Too many attempts. Try again later.");

  const later = await authenticatePin("1001", key, new Date(start.getTime() + 11 * 60 * 1000));
  if (!("user" in later)) {
    assert.fail(later.error);
  }
  assert.equal(later.user.role, "ADMIN");
});

test("sessions expire and PIN or role changes invalidate them", async () => {
  const expired = await sealSession({
    id: admin.id,
    role: "ADMIN",
    sv: 0,
    exp: Date.now() - 1000,
  });
  assert.equal(await openSession(expired), null);

  const current = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  const currentSession = buildSession(current);
  assert.ok(currentSession);
  const token = await sealSession(currentSession);
  const opened = await openSession(token);
  assert.ok(opened);
  const tampered = `${token.slice(0, -2)}aa`;
  assert.equal(await openSession(tampered), null);

  const staff = await prisma.user.findUniqueOrThrow({ where: { pinLookup: pinCredential("3003").pinLookup } });
  const staffSession = buildSession(staff);
  assert.ok(staffSession);
  assert.ok(await userFromSession(staffSession));

  const renamedOnly = await updateStaffMember(admin, {
    id: staff.id,
    name: "Staff",
    pin: "",
    role: "STAFF",
    active: true,
    canScan: true,
  });
  assert.equal("saved" in renamedOnly, true);
  assert.ok(await userFromSession(staffSession));

  const rotated = await updateStaffMember(admin, {
    id: staff.id,
    name: "Staff",
    pin: "3333",
    role: "STAFF",
    active: true,
    canScan: true,
  });
  assert.equal("saved" in rotated, true);
  assert.equal(await userFromSession(staffSession), null);
  assert.equal("error" in (await authenticatePin("3003", "after-pin-change")), true);
  const signedIn = await authenticatePin("3333", "after-pin-change-ok");
  if (!("user" in signedIn)) {
    assert.fail(signedIn.error);
  }
  assert.equal(signedIn.user.sessionVersion, staff.sessionVersion + 1);

  const promoted = await updateStaffMember(admin, {
    id: staff.id,
    name: "Staff",
    pin: "",
    role: "MANAGER",
    active: true,
    canScan: true,
  });
  assert.equal("saved" in promoted, true);
  const afterRole = buildSession({ ...staff, role: "STAFF", sessionVersion: staff.sessionVersion + 1 });
  assert.ok(afterRole);
  assert.equal(await userFromSession(afterRole), null);
});

test("parallel login failures lock the client", async () => {
  const key = "parallel-lock";
  const start = new Date("2026-10-22T15:00:00.000Z");
  await Promise.all(
    Array.from({ length: 8 }, () => recordLoginFailure(key, start))
  );
  const row = await prisma.loginThrottle.findUniqueOrThrow({ where: { key } });
  assert.equal(row.failures, 8);
  assert.ok(row.lockedUntil && row.lockedUntil.getTime() > start.getTime());

  const locked = await authenticatePin("0000", key, new Date(start.getTime() + 1000));
  assert.equal("error" in locked && locked.error, "Too many attempts. Try again later.");

  await recordLoginFailure(key, new Date(start.getTime() + 11 * 60 * 1000));
  const reset = await prisma.loginThrottle.findUniqueOrThrow({ where: { key } });
  assert.equal(reset.failures, 1);
  assert.equal(reset.lockedUntil, null);
});

test("deactivation keeps the movement name and blocks the PIN", async () => {
  const casey = await prisma.user.create({
    data: { name: "Casey", role: "STAFF", ...pinCredential("6161") },
  });
  const item = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-test" } });
  const movement = await prisma.history.create({
    data: {
      itemId: item.id,
      userId: casey.id,
      actorName: "Casey",
      action: "REMOVE",
      amount: 1,
      quantityBefore: 10,
      quantityAfter: 9,
    },
  });
  const renamed = await updateStaffMember(admin, {
    id: casey.id,
    name: "Casey Renamed",
    pin: "",
    role: "STAFF",
    active: true,
    canScan: true,
  });
  assert.equal("saved" in renamed, true);
  const afterRename = await prisma.history.findUniqueOrThrow({ where: { id: movement.id } });
  assert.equal(afterRename.userId, casey.id);
  assert.equal(afterRename.actorName, "Casey");
  assert.equal(movementActorLabel(afterRename), "Casey");

  const deactivated = await removeStaffMember(admin, casey.id);
  assert.equal("saved" in deactivated, true);
  const person = await prisma.user.findUniqueOrThrow({ where: { id: casey.id } });
  assert.equal(person.active, false);
  const after = await prisma.history.findUniqueOrThrow({ where: { id: movement.id } });
  assert.equal(after.userId, casey.id);
  assert.equal(after.actorName, "Casey");
  const login = await authenticatePin("6161", "casey-deactivated");
  assert.equal("error" in login && login.error, "That PIN is not recognized.");
  const quantity = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(quantity.quantity, 10);
});

test("two admins cannot demote each other out of the last admin seat", async () => {
  const second = await prisma.user.create({
    data: { name: "Second Admin", role: "ADMIN", ...pinCredential("7171") },
  });
  const results = await Promise.all([
    updateStaffMember(admin, {
      id: admin.id,
      name: "Admin",
      pin: "",
      role: "STAFF",
      active: true,
      canScan: true,
    }),
    updateStaffMember(
      { id: second.id, role: "ADMIN" },
      {
        id: second.id,
        name: "Second Admin",
        pin: "",
        role: "STAFF",
        active: true,
        canScan: true,
      }
    ),
  ]);
  const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
  assert.equal(admins, 1);
  assert.equal(results.filter((result) => "error" in result).length, 1);
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN", active: true } });
  await prisma.user.update({ where: { id: second.id }, data: { role: "STAFF", active: false } });
});

test("seeding does not rewrite an existing account", async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  const quantity = await prisma.item.findUniqueOrThrow({ where: { qrCodeData: "ZAP-ITEM-test" } });
  await prisma.user.update({
    where: { id: admin.id },
    data: { role: "ADMIN", active: false, canScan: false, name: "Renamed Admin" },
  });
  try {
    await seedMissingUsers();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert.equal(after.role, "ADMIN");
    assert.equal(after.active, false);
    assert.equal(after.canScan, false);
    assert.equal(after.name, "Renamed Admin");
    assert.equal(after.pinHash, before.pinHash);
    const still = await prisma.item.findUniqueOrThrow({ where: { id: quantity.id } });
    assert.equal(still.quantity, quantity.quantity);
  } finally {
    await prisma.user.update({
      where: { id: admin.id },
      data: { active: true, canScan: true, name: before.name, role: "ADMIN" },
    });
  }
});

test("server actions and the editor do not trust a cookie or show a PIN", () => {
  const scan = fs.readFileSync(path.join(repoRoot, "app/scan/actions.ts"), "utf8");
  const items = fs.readFileSync(path.join(repoRoot, "app/items/actions.ts"), "utf8");
  const editor = fs.readFileSync(path.join(repoRoot, "app/settings/user-manager.tsx"), "utf8");
  assert.match(scan, /getCurrentUser/);
  assert.match(items, /inventoryAccessError/);
  assert.match(editor, /Leave blank to keep the current PIN/);
  assert.match(editor, /name="name"/);
  assert.match(editor, /Deactivate/);
  assert.doesNotMatch(editor, /Delete user/);
  assert.doesNotMatch(editor, /defaultValue=\{user\.pin\}/);
});
