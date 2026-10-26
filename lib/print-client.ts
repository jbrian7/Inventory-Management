import {
  interpretHealth,
  interpretPrintResponse,
  printerHost,
  unconfiguredDiagnostics,
  unreachableDiagnostics,
  type LabelRequest,
  type PrinterDiagnostics,
  type PrintOutcome,
} from "@/lib/print-job";

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;
type ServerEnv = Record<string, string | undefined>;

function readConfig(env: ServerEnv = process.env) {
  const url = env.PRINT_SERVER_URL?.trim() ?? "";
  const token = env.PRINT_SERVER_TOKEN?.trim() ?? "";
  const host = printerHost(url);
  return {
    url: host ? url : "",
    host,
    token,
    configured: Boolean(host && token.length >= 16),
  };
}

async function callPrintServer(
  path: string,
  init: RequestInit,
  options?: { fetchImpl?: FetchImpl; env?: ServerEnv; timeoutMs?: number }
) {
  const config = readConfig(options?.env);
  if (!config.configured || !config.host) {
    return { config, response: null as Response | null, networkError: false, skipped: true };
  }
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    const response = await fetchImpl(new URL(path, config.host).toString(), {
      ...init,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { config, response, networkError: false, skipped: false };
  } catch {
    return { config, response: null, networkError: true, skipped: false };
  }
}

export async function sendLabel(
  label: LabelRequest,
  options?: { fetchImpl?: FetchImpl; env?: ServerEnv; timeoutMs?: number }
): Promise<PrintOutcome> {
  const result = await callPrintServer(
    "/print",
    { method: "POST", body: JSON.stringify(label) },
    options
  );
  if (!result.config.host) {
    return {
      printed: false,
      error: result.config.url || result.config.token
        ? unreachableDiagnostics(null).detail
        : unconfiguredDiagnostics().detail,
    };
  }
  if (result.config.token.length < 16) {
    return {
      printed: false,
      error: "PRINT_SERVER_TOKEN is missing or shorter than 16 characters. It stays on the app server.",
    };
  }
  if (result.networkError || !result.response) {
    return {
      printed: false,
      error: unreachableDiagnostics(result.config.host).detail,
    };
  }
  const body = await result.response.json().catch(() => null);
  return interpretPrintResponse(result.response.status, body);
}

export async function probePrinter(options?: {
  fetchImpl?: FetchImpl;
  env?: ServerEnv;
  timeoutMs?: number;
}): Promise<PrinterDiagnostics> {
  const result = await callPrintServer("/health", { method: "GET" }, {
    ...options,
    timeoutMs: options?.timeoutMs ?? 3000,
  });
  if (!result.config.host && !result.config.token) {
    return unconfiguredDiagnostics();
  }
  if (!result.config.host) {
    return unreachableDiagnostics(null);
  }
  if (result.config.token.length < 16) {
    return {
      ...unconfiguredDiagnostics(),
      host: result.config.host,
      detail: "PRINT_SERVER_TOKEN is missing or shorter than 16 characters. It stays on the app server.",
    };
  }
  if (result.networkError || !result.response) {
    return unreachableDiagnostics(result.config.host);
  }
  const body = await result.response.json().catch(() => null);
  return interpretHealth(result.response.status, body, result.config.host);
}
