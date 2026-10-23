"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function RetryLoad({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3" role="alert">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button type="button" className="h-12" onClick={() => router.refresh()}>
        Try again
      </Button>
    </div>
  );
}
