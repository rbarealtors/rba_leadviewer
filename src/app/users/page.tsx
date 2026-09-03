import { AppHeader } from "@/app/AppHeader";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getUsersForAdmin } from "@/lib/auth/get-users";
import { UsersClient } from "./UsersClient";
import type { ManagedUser } from "@/lib/auth/user-list";

export default async function UsersPage() {
  const user = await requireAdmin();
  let users: ManagedUser[] = [];
  let loadError = false;

  try {
    users = await getUsersForAdmin();
  } catch {
    loadError = true;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user.email} isAdmin />

      <UsersClient users={users} loadError={loadError} />
    </div>
  );
}