import { businessDayRange } from "@/lib/business-time";
import { presentMovement, type MovementSnapshot } from "@/lib/dashboard";
import { isStockAction, type StockAction } from "@/lib/movement";
import { historyUnavailableMessage } from "@/lib/page-messages";
import { prisma } from "@/lib/prisma";
import { isRole, type Role } from "@/lib/roles";

export { historyUnavailableMessage };

export const historyPageSize = 20;

const idPattern = /^[a-z0-9]{10,40}$/i;

export type HistoryQuery = {
  itemId: string;
  action: StockAction | "";
  staff: string;
  from: string;
  to: string;
  page: number;
  error: string | null;
};

export function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export function parseHistoryQuery(input: {
  item?: string;
  action?: string;
  staff?: string;
  from?: string;
  to?: string;
  page?: string;
}): HistoryQuery {
  const itemId = input.item ?? "";
  const actionRaw = input.action ?? "";
  const staff = input.staff ?? "";
  const from = input.from ?? "";
  const to = input.to ?? "";
  const pageRaw = Number(input.page);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 && pageRaw <= 10000 ? pageRaw : 1;
  let error: string | null = null;
  let action: StockAction | "" = "";

  if (itemId && !idPattern.test(itemId)) {
    error = "That item filter is not recognized.";
  } else if (actionRaw) {
    if (!isStockAction(actionRaw)) {
      error = "That action is not recognized.";
    } else {
      action = actionRaw;
    }
  }
  if (!error && staff && staff !== "unknown" && !idPattern.test(staff)) {
    error = "That staff filter is not recognized.";
  }
  if (!error && ((from && !isDateInput(from)) || (to && !isDateInput(to)))) {
    error = "Enter a valid date.";
  }
  if (!error && from && to && from > to) {
    error = "The start date is after the end date.";
  }

  return { itemId: error ? "" : itemId, action, staff: error ? "" : staff, from, to, page, error };
}

function isDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function filtersActive(query: Pick<HistoryQuery, "itemId" | "action" | "staff" | "from" | "to">) {
  return Boolean(query.itemId || query.action || query.staff || query.from || query.to);
}

export function historyEmptyMessage(active: boolean) {
  return active
    ? "No movements match these filters."
    : "No stock movements yet. Scan a label to record the first one.";
}

export function historyWhere(query: HistoryQuery) {
  const timestamp: { gte?: Date; lt?: Date } = {};
  if (query.from) {
    timestamp.gte = businessDayRange(query.from).start;
  }
  if (query.to) {
    timestamp.lt = businessDayRange(query.to).end;
  }
  return {
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.staff === "unknown" ? { userId: null } : {}),
    ...(query.staff && query.staff !== "unknown" ? { userId: query.staff } : {}),
    ...(query.from || query.to ? { timestamp } : {}),
  };
}

export function pageWindow(page: number, total: number, pageSize = historyPageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), total === 0 ? 1 : pages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  return {
    current,
    pages,
    start,
    end,
    skip: (current - 1) * pageSize,
  };
}

export function historyHref(
  query: Pick<HistoryQuery, "itemId" | "action" | "staff" | "from" | "to">,
  page: number
) {
  const params = new URLSearchParams();
  if (query.itemId) {
    params.set("item", query.itemId);
  }
  if (query.action) {
    params.set("action", query.action);
  }
  if (query.staff) {
    params.set("staff", query.staff);
  }
  if (query.from) {
    params.set("from", query.from);
  }
  if (query.to) {
    params.set("to", query.to);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const search = params.toString();
  return search ? `/history?${search}` : "/history";
}

export function historyAccessError(user: { role: string; active: boolean } | null) {
  if (!user || !user.active || !isRole(user.role)) {
    return "Sign in to view history.";
  }
  return null;
}

export function canViewHistory(role: Role | string | null | undefined) {
  return historyAccessError(role ? { role, active: true } : null) === null;
}

type HistoryDb = {
  history: {
    findMany: (args: unknown) => Promise<MovementSnapshot[]>;
    count: (args: unknown) => Promise<number>;
  };
};

export async function loadHistory(query: HistoryQuery, db: HistoryDb = prisma as unknown as HistoryDb) {
  if (query.error) {
    throw new Error(query.error);
  }
  const where = historyWhere(query);
  const total = await db.history.count({ where });
  const window = pageWindow(query.page, total);
  const rows = await db.history.findMany({
    where,
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    skip: window.skip,
    take: historyPageSize,
    include: {
      user: { select: { name: true } },
      item: { select: { id: true, name: true } },
    },
  });
  return {
    total,
    window,
    rows: rows.map(presentMovement),
  };
}
