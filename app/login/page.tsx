import { PinPad } from "@/app/login/pin-pad";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8 pt-8">
      <header className="space-y-1 text-center">
        <p className="text-sm font-medium text-muted-foreground">Zap Zone</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      </header>
      <PinPad />
    </div>
  );
}
