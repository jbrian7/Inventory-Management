import { createSign } from "node:crypto";
import fs from "node:fs";

import { sheetNames, type SheetName } from "@/lib/storage/schema";
import { Workbook } from "@/lib/storage/workbook";
import type { WorkbookStore } from "@/lib/storage/workbook-store";

const sheetsScope = "https://www.googleapis.com/auth/spreadsheets";
const padRows = 300;

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type TokenCache = { token: string; expiresAt: number };

let tokenCache: TokenCache | null = null;

export function clearGoogleTokenCache() {
  tokenCache = null;
}

export function readServiceAccount(env: {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
} = {
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
}): ServiceAccount {
  const inline = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const raw = inline || (env.GOOGLE_APPLICATION_CREDENTIALS ? fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8") : "");
  if (!raw) {
    throw new Error("Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS for Google Sheets.");
  }
  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("The Google service account JSON needs client_email and private_key.");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

function spreadsheetId(env: NodeJS.ProcessEnv = process.env) {
  const id = env.SPREADSHEET_ID?.trim() ?? "";
  if (!id) {
    throw new Error("Set SPREADSHEET_ID to this deployment's spreadsheet.");
  }
  return id;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function serviceAccountAssertion(account: ServiceAccount, now = Math.floor(Date.now() / 1000)) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: sheetsScope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;
}

async function accessToken(account: ServiceAccount, fetchImpl: typeof fetch = fetch) {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: serviceAccountAssertion(account),
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error("Google refused the service account token request.");
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error("Google did not return an access token.");
  }
  tokenCache = { token: payload.access_token, expiresAt: now + (payload.expires_in ?? 3600) * 1000 };
  return payload.access_token;
}

function pad(grid: string[][], width: number) {
  const rows = grid.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) {
      next.push("");
    }
    return next;
  });
  while (rows.length < padRows) {
    rows.push(Array.from({ length: width }, () => ""));
  }
  return rows;
}

export function googleWorkbookStore(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): WorkbookStore {
  const id = spreadsheetId(env);
  const account = readServiceAccount({
    GOOGLE_SERVICE_ACCOUNT_JSON: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  async function api(path: string, init: RequestInit = {}) {
    const token = await accessToken(account, fetchImpl);
    const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error("Google Sheets rejected the request.");
    }
    return response.json() as Promise<unknown>;
  }

  return {
    async load() {
      const params = sheetNames.map((name) => `ranges=${encodeURIComponent(`${name}!A:Z`)}`).join("&");
      const payload = (await api(`/values:batchGet?${params}`)) as {
        valueRanges?: { range?: string; values?: string[][] }[];
      };
      const grids: Partial<Record<SheetName, string[][]>> = {};
      for (const range of payload.valueRanges ?? []) {
        const title = range.range?.split("!")[0]?.replace(/^'|'$/g, "");
        if (title && sheetNames.includes(title as SheetName)) {
          grids[title as SheetName] = (range.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
        }
      }
      return Workbook.fromGrids(grids);
    },
    async save(book) {
      const grids = book.toGrids();
      const data = sheetNames.map((name) => ({
        range: `${name}!A1`,
        values: pad(grids[name], grids[name][0]?.length ?? 1),
      }));
      await api("/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      });
    },
  };
}

export async function ensureSheetTabs(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  const id = spreadsheetId(env);
  const account = readServiceAccount({
    GOOGLE_SERVICE_ACCOUNT_JSON: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  const token = await accessToken(account, fetchImpl);
  const current = (await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Google Sheets rejected the request.");
    }
    return response.json() as Promise<{ sheets?: { properties?: { title?: string } }[] }>;
  }));
  const present = new Set((current.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));
  const requests = sheetNames.filter((name) => !present.has(name)).map((name) => ({ addSheet: { properties: { title: name } } }));
  if (requests.length === 0) {
    return;
  }
  const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) {
    throw new Error("Google Sheets could not add the inventory tabs.");
  }
}
