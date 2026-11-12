import { Suspense } from "react";

import { DashboardLoading, HomeActions } from "@/app/home-actions";
import { HomeDashboard } from "@/app/home-dashboard";
import { getCurrentUser } from "@/lib/current-user";
import { homeActions } from "@/lib/dashboard";
import { usingSheets } from "@/lib/storage/backend";
import { SheetsHome } from "@/app/sheets-home";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  const user = await getCurrentUser();
  const actions = homeActions(user?.role);

  return (
    <div className="flex flex-col gap-6">
      {searchParams.denied === "settings" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
          Settings is for admins and managers.
        </p>
      ) : null}
      <div className="flex flex-col gap-4 tablet:!flex-row tablet:items-end tablet:justify-between">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">Scan a bin label to check stock in or out.</p>
        </header>
        <HomeActions canEdit={actions.addItem} />
      </div>
      <Suspense fallback={<DashboardLoading />}>
        {usingSheets() ? <SheetsHome /> : <HomeDashboard />}
      </Suspense>
    </div>
  );
}
