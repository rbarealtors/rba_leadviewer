import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut, lockSalesSession } from "@/app/login/actions";
import { PWAInstallCard } from "@/components/sales/PWAInstallCard";
import { UserCircleIcon, CheckIcon } from "@/components/sales/icons";

export default async function SalesSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Sales Representative";
  const email = user.email || "";
  const role = user.app_metadata?.role || "sales";

  return (
    <div className="flex flex-col min-h-full bg-slate-50 pb-28">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="text-slate-400 text-xs font-medium mt-0.5">
              Account, security, and app preferences
            </p>
          </div>
          <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-300">
            <UserCircleIcon className="w-6 h-6" />
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Profile Card */}
        <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white flex items-center justify-center font-bold text-xl shadow-xs">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-900 truncate">{fullName}</h2>
              <p className="text-xs text-slate-500 truncate mt-0.5">{email}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 uppercase tracking-wider">
                  {role}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Security & PIN */}
        <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Security & Access</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage device authentication and session protection
            </p>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-150">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">4-Digit Agent PIN</div>
                <div className="text-[11px] text-slate-500">Device session authenticated</div>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">
              VERIFIED
            </span>
          </div>

          <form action={lockSalesSession}>
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Lock Session (Require PIN)
            </button>
          </form>
        </section>

        {/* PWA Install Card */}
        <section>
          <PWAInstallCard />
        </section>

        {/* App Info */}
        <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-3">
          <h3 className="font-bold text-slate-900 text-sm">Application Information</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500">Version</span>
              <span className="font-semibold text-slate-900">1.0.0 (Production)</span>
            </div>
            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500">Framework</span>
              <span className="font-semibold text-slate-900">Next.js 15 · Edge</span>
            </div>
            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500">Realtime Sync</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
            </div>
          </div>
        </section>

        {/* Sign Out */}
        <section className="pt-2">
          <form action={signOut}>
            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 font-bold rounded-2xl text-sm transition-colors flex items-center justify-center gap-2 border border-red-100 shadow-xs"
            >
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Sign Out
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
