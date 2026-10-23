import { redirect } from "next/navigation";

import { PrinterForm } from "@/app/settings/printer-form";
import { NameManager } from "@/app/settings/name-manager";
import {
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  updateCategory,
  updateLocation,
} from "@/app/settings/actions";
import { UserManager } from "@/app/settings/user-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canManageSettings, isRole } from "@/lib/roles";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reauth=1");
  }
  if (!isRole(user.role) || !canManageSettings(user.role)) {
    redirect("/?denied=settings");
  }

  const [users, locations, categories] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, role: true, canScan: true, active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Staff, rooms, and categories for Zap Zone.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <UserManager actorRole={user.role} users={users} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <NameManager
            label="Location"
            addLabel="Add New Location"
            placeholder="Redemption Counter"
            items={locations}
            createAction={createLocation}
            updateAction={updateLocation}
            deleteAction={deleteLocation}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Categories</CardTitle>
        </CardHeader>
        <CardContent>
          <NameManager
            label="Category"
            addLabel="Add New Category"
            placeholder="Arcade Parts"
            items={categories}
            createAction={createCategory}
            updateAction={updateCategory}
            deleteAction={deleteCategory}
          />
        </CardContent>
      </Card>

      <PrinterForm />
    </div>
  );
}
