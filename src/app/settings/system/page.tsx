import { requireAdmin } from "@/lib/auth/require-admin";
import { AppHeader } from "@/app/AppHeader";
import { getMaxBrowserPdfSourceMb } from "@/lib/settings/system-settings";
import { SystemSettingsClient } from "./SystemSettingsClient";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const user = await requireAdmin();
  const maxSourceMb = await getMaxBrowserPdfSourceMb();

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader email={user.email} isAdmin />

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <SystemSettingsClient initialMaxSourceMb={maxSourceMb} />
      </main>
    </div>
  );
}
