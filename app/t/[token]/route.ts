import { NextResponse } from "next/server";

import { businessName } from "@/lib/brand";
import { publicClientKey } from "@/lib/public-client";
import {
  publicToteHeaders,
  renderPublicLimited,
  renderPublicMissing,
  renderPublicTotePage,
} from "@/lib/public-tote-page";
import { consumePublicScan } from "@/lib/public-scan-limit";
import { loadPublicTote } from "@/lib/tote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const limited = await consumePublicScan(publicClientKey(request.headers));
  if (limited) {
    return new NextResponse(renderPublicLimited(), { status: 429, headers: publicToteHeaders });
  }
  const tote = await loadPublicTote(params.token);
  if (!tote) {
    return new NextResponse(renderPublicMissing(), { status: 404, headers: publicToteHeaders });
  }
  return new NextResponse(renderPublicTotePage({ ...tote, businessName: businessName() }), {
    status: 200,
    headers: publicToteHeaders,
  });
}
