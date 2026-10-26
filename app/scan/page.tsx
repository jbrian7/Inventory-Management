import { QrScanner } from "@/app/scan/qr-scanner";

export default function ScanPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
        <p className="text-sm text-muted-foreground">
          Use the camera to check stock in or out.
        </p>
      </header>
      <QrScanner />
    </div>
  );
}
