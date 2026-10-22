import { redirect } from "next/navigation";

import { PrinterForm } from "@/app/settings/printer-form";
import { NameManager } from "@/app/settings/name-manager";
import {
  createCategory,
  createLocation,
  updateCategory,
  updateLocation,
} from "@/app/settings/actions";
import { UserManager } from "@/app/settings/user-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/roles";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!canManageSettings(user.role)) {
    redirect("/?denied=settings");
  }

  const [users, locations, categories] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
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

      <Tabs defaultValue="users">
        <TabsList className="grid h-12 w-full grid-cols-3">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UserManager users={users} />
        </TabsContent>
        <TabsContent value="locations" className="mt-4">
          <NameManager
            label="Location"
            placeholder="Redemption Counter"
            items={locations}
            createAction={createLocation}
            updateAction={updateLocation}
          />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <NameManager
            label="Category"
            placeholder="Arcade Parts"
            items={categories}
            createAction={createCategory}
            updateAction={updateCategory}
          />
        </TabsContent>
      </Tabs>

      <PrinterForm />
    </div>
  );
}
