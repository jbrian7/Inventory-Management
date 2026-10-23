import { TestPrintButton } from "@/app/settings/test-print-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PrinterDiagnostics } from "@/lib/print-job";

const modeLabel: Record<PrinterDiagnostics["mode"], string> = {
  unconfigured: "Not configured",
  unreachable: "Unreachable",
  preview: "Preview only",
  ready: "Ready",
  error: "Needs attention",
};

export function PrinterForm({ diagnostics }: { diagnostics: PrinterDiagnostics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Label printer</CardTitle>
        <CardDescription>
          The app server sends labels to the Pi. The printer token stays in server environment variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium">{modeLabel[diagnostics.mode]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Print server</dt>
            <dd className="break-all text-right">{diagnostics.host ?? "Not set"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Driver</dt>
            <dd>{diagnostics.driver ?? "Unknown"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">CUPS queue</dt>
            <dd>{diagnostics.destination ?? "Not set"}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground" role="status">
          {diagnostics.detail}
        </p>
        <TestPrintButton disabled={!diagnostics.configured} />
      </CardContent>
    </Card>
  );
}
