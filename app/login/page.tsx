import { PinPad } from "@/app/login/pin-pad";
import { ProductLockup } from "@/components/product-lockup";
import { businessName, productName } from "@/lib/brand";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8 pt-8">
      <header className="space-y-3 text-center">
        <ProductLockup product={productName} business={businessName()} align="center" />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      </header>
      <PinPad />
    </div>
  );
}
