"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { usePathname } from "next/navigation";

export function AppHeader({
  email,
  isAdmin,
}: {
  email?: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isUsers = pathname.startsWith("/users");
  const isSettings = pathname.startsWith("/settings");
  const isReports = pathname.startsWith("/reports");
  const isLeads =
    pathname.startsWith("/leads") || (!isUsers && !isSettings && !isReports && pathname === "/");
  const isBrochures = pathname.startsWith("/brochures");

  // Close menu on outside click or Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <header className="border-b border-[#0f3529] bg-[#174B3A] sticky top-0 z-30 shadow-xs">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8 h-full">
          <Link href="/leads" className="flex items-center gap-2">
            <svg
              className="w-6 h-6 text-emerald-300"
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
              <span className="font-bold text-white">RBA Realtors</span>
              <span className="text-white/40 ml-2">|</span>
              <span className="text-emerald-100/90 ml-2">Lead Viewer</span>
            </div>
          </Link>

          {isAdmin && (
            <nav aria-label="Primary navigation" className="flex items-center gap-6 text-sm h-full font-medium">
              <Link
                href="/leads"
                className={`h-full flex items-center border-b-2 transition-colors ${
                  isLeads
                    ? "text-white border-white font-semibold"
                    : "text-emerald-100/70 hover:text-white border-transparent"
                }`}
              >
                Leads
              </Link>
              <Link
                href="/reports/attribution"
                className={`h-full flex items-center border-b-2 transition-colors ${
                  isReports
                    ? "text-white border-white font-semibold"
                    : "text-emerald-100/70 hover:text-white border-transparent"
                }`}
              >
                Reports
              </Link>
              <Link
                href="/users"
                className={`h-full flex items-center border-b-2 transition-colors ${
                  isUsers
                    ? "text-white border-white font-semibold"
                    : "text-emerald-100/70 hover:text-white border-transparent"
                }`}
              >
                User Management
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-emerald-100/80 hidden sm:inline">{email}</span>

          {/* Menu Dropdown: Secondary Resources (Menu → Resources → Brochures) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="p-1.5 text-white hover:text-white rounded border border-white/25 bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5 text-xs font-medium shadow-2xs"
            >
              <svg className="w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Menu</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-panel border border-line rounded-lg shadow-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-sm">
                <div className="px-3 py-1.5">
                  <p className="text-[11px] font-bold text-subtle uppercase tracking-wider mb-1">
                    Resources
                  </p>
                  <Link
                    href="/brochures"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                      isBrochures
                        ? "bg-accent/10 text-accent"
                        : "text-ink hover:bg-canvas"
                    }`}
                  >
                    <svg
                      className="w-4 h-4 text-accent shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>Brochures</span>
                  </Link>
                </div>

                {isAdmin && (
                  <div className="px-3 py-1.5 border-t border-line mt-1 pt-1.5">
                    <p className="text-[11px] font-bold text-subtle uppercase tracking-wider mb-1">
                      Settings
                    </p>
                    <Link
                      href="/settings/system"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold text-ink hover:bg-canvas transition-colors"
                    >
                      <svg
                        className="w-4 h-4 text-accent shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span>System Settings</span>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="text-xs font-semibold text-white bg-rose-500/80 hover:bg-rose-500 border border-rose-400/40 rounded px-3 py-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
