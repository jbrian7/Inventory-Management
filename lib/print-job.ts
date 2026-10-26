import { businessName } from "@/lib/brand";
import { canManageSettings, isRole } from "@/lib/roles";

export type PrintUser = { role: string; active: boolean } | null;

export type LabelRequest = {
  name: string;
  sku: string;
  qrData: string;
};

export type PrintOutcome =
  | { status: "printed"; printed: true }
  | { status: "preview"; printed: false }
  | { error: string; printed: false; status?: undefined };

const maxName = 200;
const maxSku = 80;
const maxQr = 256;

export function printAccessError(user: PrintUser) {
  if (!user || !user.active || !isRole(user.role)) {
    return "Sign in to print a label.";
  }
  return null;
}

export function printerAdminError(user: PrintUser) {
  if (!user || !user.active || !canManageSettings(user.role)) {
    return "Only admins and managers can manage the printer.";
  }
  return null;
}

export function validateLabelFields(input: LabelRequest): { error: string } | { label: LabelRequest } {
  const name = clean(input.name, maxName, "Name");
  if ("error" in name) {
    return name;
  }
  const sku = clean(input.sku, maxSku, "SKU");
  if ("error" in sku) {
    return sku;
  }
  const qrData = clean(input.qrData, maxQr, "QR data");
  if ("error" in qrData) {
    return qrData;
  }
  return { label: { name: name.value, sku: sku.value, qrData: qrData.value } };
}

function clean(value: unknown, max: number, label: string): { error: string } | { value: string } {
  if (typeof value !== "string") {
    return { error: `${label} must be text.` };
  }
  const text = value.trim();
  if (!text) {
    return { error: `${label} is required.` };
  }
  if (text.length > max) {
    return { error: `${label} is too long.` };
  }
  if (/[\u0000-\u001F\u007F]/.test(text)) {
    return { error: `${label} contains characters that cannot be printed.` };
  }
  return { value: text };
}

export function interpretPrintResponse(status: number, body: unknown): PrintOutcome {
  const record = body && typeof body === "object" ? (body as { printed?: unknown; status?: unknown; error?: unknown; code?: unknown }) : {};
  if (status === 200 && record.printed === true && record.status === "printed") {
    return { status: "printed", printed: true };
  }
  if (status === 200 && record.printed === false && record.status === "preview") {
    return { status: "preview", printed: false };
  }
  if (status === 200) {
    return {
      printed: false,
      error: "The print server did not confirm a print.",
    };
  }
  const code = typeof record.code === "string" ? record.code : "";
  if (code === "malformed" || code === "malformed_qr" || status === 400) {
    return {
      printed: false,
      error: typeof record.error === "string" ? record.error : "That label could not be encoded.",
    };
  }
  if (code === "cups_unavailable") {
    return {
      printed: false,
      error: "CUPS is not available on the Pi. Install CUPS and confirm lp is on PATH.",
    };
  }
  if (code === "printer_offline") {
    return {
      printed: false,
      error: "The printer is offline or the CUPS queue was not found.",
    };
  }
  if (status === 401) {
    return { printed: false, error: "The print server rejected the app server credential." };
  }
  if (code === "unconfigured" || status === 503) {
    return {
      printed: false,
      error:
        typeof record.error === "string"
          ? record.error
          : "The print server is not ready.",
    };
  }
  return { printed: false, error: "The label could not be printed." };
}

export type PrinterDiagnostics = {
  configured: boolean;
  host: string | null;
  reachable: boolean;
  mode: "unconfigured" | "unreachable" | "preview" | "ready" | "error";
  driver: string | null;
  destination: string | null;
  detail: string;
};

export function printerHost(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function interpretHealth(status: number, body: unknown, host: string | null): PrinterDiagnostics {
  const record =
    body && typeof body === "object"
      ? (body as { mode?: unknown; driver?: unknown; destination?: unknown; error?: unknown })
      : {};
  if (status === 200 && (record.mode === "preview" || record.mode === "ready" || record.mode === "error")) {
    const destination = typeof record.destination === "string" ? record.destination : null;
    const driver = typeof record.driver === "string" ? record.driver : null;
    if (record.mode === "preview") {
      return {
        configured: true,
        host,
        reachable: true,
        mode: "preview",
        driver,
        destination: null,
        detail: "The Pi answered. LP_DEST is not set, so labels are prepared and not printed.",
      };
    }
    if (record.mode === "ready") {
      return {
        configured: true,
        host,
        reachable: true,
        mode: "ready",
        driver,
        destination,
        detail: destination
          ? `CUPS queue ${destination} is configured.`
          : "The USB printer driver is selected. Send a test label to confirm the printer is connected.",
      };
    }
    return {
      configured: true,
      host,
      reachable: true,
      mode: "error",
      driver,
      destination: null,
      detail: "LP_DEST is set, but it is not a valid CUPS queue name.",
    };
  }
  return {
    configured: true,
    host,
    reachable: false,
    mode: "error",
    driver: null,
    destination: null,
    detail: status === 401 ? "The print server rejected the app server credential." : "The print server did not return a status.",
  };
}

export function unconfiguredDiagnostics(): PrinterDiagnostics {
  return {
    configured: false,
    host: null,
    reachable: false,
    mode: "unconfigured",
    driver: null,
    destination: null,
    detail: "Set PRINT_SERVER_URL and PRINT_SERVER_TOKEN on the app server. The token is not stored in the browser.",
  };
}

export function unreachableDiagnostics(host: string | null): PrinterDiagnostics {
  return {
    configured: true,
    host,
    reachable: false,
    mode: "unreachable",
    driver: null,
    destination: null,
    detail: host
      ? `The app server cannot reach the print server at ${host}.`
      : "PRINT_SERVER_URL is not a valid http address.",
  };
}

type ItemLabel = { name: string; sku: string; qrCodeData: string } | null;

export async function prepareItemPrint(
  user: PrintUser,
  itemId: string,
  deps: {
    loadItem: (id: string) => Promise<ItemLabel>;
    send: (label: LabelRequest) => Promise<PrintOutcome>;
  }
): Promise<PrintOutcome> {
  const denied = printAccessError(user);
  if (denied) {
    return { printed: false, error: denied };
  }
  const id = itemId.trim();
  if (!id) {
    return { printed: false, error: "That item no longer exists." };
  }
  const item = await deps.loadItem(id);
  if (!item) {
    return { printed: false, error: "That item no longer exists." };
  }
  const parsed = validateLabelFields({
    name: item.name,
    sku: item.sku,
    qrData: item.qrCodeData,
  });
  if ("error" in parsed) {
    return { printed: false, error: parsed.error };
  }
  return deps.send(parsed.label);
}

export async function prepareTestPrint(
  user: PrintUser,
  send: (label: LabelRequest) => Promise<PrintOutcome>
): Promise<PrintOutcome> {
  const denied = printerAdminError(user);
  if (denied) {
    return { printed: false, error: denied };
  }
  return send({ name: `${businessName()} test`, sku: "TEST", qrData: "ZAP-TEST" });
}
