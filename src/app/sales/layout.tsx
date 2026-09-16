import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import PINEntryScreenClientWrapper from "./PINEntryScreenClientWrapper";
import { BottomNav } from "@/components/sales/BottomNav";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null; // Handled by middleware
  }

  const role = user.app_metadata?.role;
  const cookieStore = await cookies();
  const isPinVerified = cookieStore.has("sales_pin_verified");

  if (role === "sales" && !isPinVerified) {
    return <PINEntryScreenClientWrapper />;
  }

  return (
    <div className="w-full md:max-w-md md:mx-auto min-h-[100dvh] bg-slate-50 flex flex-col relative shadow-none md:shadow-xl md:border-x md:border-slate-200 pb-16">
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
