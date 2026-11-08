import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { BrowserPrintButton } from "@/app/totes/[id]/label/browser-print-button";
import { PiPrintButton } from "@/app/totes/[id]/label/pi-print-button";
import { Button } from "@/components/ui/button";
import { businessName } from "@/lib/brand";
import { toteQrOptions } from "@/lib/label-print";
import { prisma } from "@/lib/prisma";
import { totePublicUrl } from "@/lib/public-url";

export default async function ToteLabelPage({ params }: { params: { id: string } }) {
  const tote = await prisma.tote.findUnique({ where: { id: params.id } });
  if (!tote) {
    notFound();
  }
  const url = totePublicUrl(tote.publicToken);
  const svg = "url" in url ? await QRCode.toString(url.url, toteQrOptions) : "";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <header className="space-y-1 print:hidden">
        <p className="text-sm text-muted-foreground">Tote label</p>
        <h1 className="text-2xl font-semibold tracking-tight">{tote.name}</h1>
      </header>
      {"error" in url ? (
        <p className="rounded-xl border bg-card p-4 text-sm" role="alert">
          {url.error} Production labels need a publicly reachable https address in PUBLIC_BASE_URL. Localhost and LAN addresses are not accepted.
        </p>
      ) : (
        <article className="tote-label rounded-xl border border-black">
          <p className="business">{businessName()}</p>
          <h2>{tote.name}</h2>
          {tote.storageLabel ? <p className="shelf">{tote.storageLabel}</p> : null}
          <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
        </article>
      )}
      {"url" in url ? (
        <p className="break-all text-xs text-muted-foreground print:hidden">{url.url}</p>
      ) : null}
      {"url" in url && !tote.publicEnabled ? (
        <p className="text-sm font-medium print:hidden">Public viewing is off, so this QR code will not open the contents.</p>
      ) : null}
      {"url" in url ? <BrowserPrintButton /> : null}
      <PiPrintButton toteId={tote.id} />
      <Button asChild variant="secondary" className="h-12 print:hidden">
        <Link href={`/totes/${tote.id}`}>Back to tote</Link>
      </Button>
    </div>
  );
}
