import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { itemTotalsCsv, locationBalancesCsv, reportAccessError, toteContentsCsv, transferHistoryCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reports = {
  items: { filename: "item-totals.csv", load: itemTotalsCsv },
  balances: { filename: "location-balances.csv", load: locationBalancesCsv },
  totes: { filename: "tote-contents.csv", load: toteContentsCsv },
  transfers: { filename: "transfer-history.csv", load: transferHistoryCsv },
} as const;

export async function GET(_request: Request, { params }: { params: { report: string } }) {
  const selected = reports[params.report as keyof typeof reports];
  if (!selected) {
    return new NextResponse("That report is not available.", { status: 404 });
  }
  const user = await getCurrentUser();
  const denied = reportAccessError(user);
  if (denied) {
    return new NextResponse(denied, { status: 403 });
  }
  const body = await selected.load();
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${selected.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
