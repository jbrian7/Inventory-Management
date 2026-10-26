export function ProductLockup({
  product,
  business,
  align = "start",
}: {
  product: string;
  business: string;
  align?: "start" | "center";
}) {
  return (
    <div className={align === "center" ? "space-y-0.5 text-center" : "space-y-0.5"}>
      <p className="text-sm font-semibold tracking-tight">{product}</p>
      <p className="text-sm text-muted-foreground">{business}</p>
    </div>
  );
}
