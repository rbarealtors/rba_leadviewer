import Link from "next/link";
import { signOut } from "@/app/login/actions";

export function AppHeader({ email, isAdmin }: { email?: string; isAdmin: boolean }) {
  // We can't use `usePathname` in a Server Component natively if this is one, 
  // wait, is AppHeader a client component? It doesn't have "use client" so it's a server component.
  // Actually, wait, let's just use "use client" so we can check the active path, OR just hardcode the "Leads" styling if we don't have a dynamic path check.
  // I will add "use client" to the top.
  return (
    <header className="border-b border-line bg-panel">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8 h-full">
          <Link href="/leads" className="flex items-center gap-2">
            <svg
              className="w-6 h-6 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 21h18" />
              <path d="M9 8h1" />
              <path d="M9 12h1" />
              <path d="M9 16h1" />
              <path d="M14 8h1" />
              <path d="M14 12h1" />
              <path d="M14 16h1" />
              <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
            </svg>
            <div className="text-sm">
              <span className="font-bold text-accent">RBA Realtors</span>
              <span className="text-subtle ml-2">|</span>
              <span className="text-ink ml-2">Lead Viewer</span>
            </div>
          </Link>
          {isAdmin && (
            <nav aria-label="Primary navigation" className="flex items-center gap-6 text-sm h-full font-medium">
              <Link
                href="/leads"
                className="h-full flex items-center text-accent border-b-2 border-accent"
              >
                Leads
              </Link>
              <Link
                href="/users"
                className="h-full flex items-center text-subtle hover:text-ink border-b-2 border-transparent"
              >
                User Management
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-subtle">{email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs font-medium text-ink border border-line rounded px-3 py-1.5 hover:bg-canvas transition-colors shadow-2xs"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}