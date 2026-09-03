import Link from "next/link";
import { signOut } from "@/app/login/actions";

export function AppHeader({ email, isAdmin }: { email?: string; isAdmin: boolean }) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/leads" className="text-sm font-semibold text-ink">
            RBA Realtors — Lead Viewer
          </Link>
          {isAdmin && (
            <nav aria-label="Primary navigation" className="flex items-center gap-4 text-xs">
              <Link href="/leads" className="text-subtle hover:text-ink">
                Leads
              </Link>
              <Link href="/users" className="text-subtle hover:text-ink">
                User Management
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-subtle">{email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-subtle hover:text-ink border border-line rounded px-2.5 py-1"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}