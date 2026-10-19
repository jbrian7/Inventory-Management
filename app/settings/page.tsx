import { PrinterForm } from "@/app/settings/printer-form";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Device and stockroom preferences for Zap Zone.
        </p>
      </header>
      <PrinterForm />
    </div>
  );
}
