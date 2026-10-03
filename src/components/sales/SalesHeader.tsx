"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";

interface SalesHeaderProps {
  title?: string;
  subtitle?: string;
  userInitial?: string;
  userName?: string;
  showBack?: boolean;
  backHref?: string;
}

export function SalesHeader({
  title = "Action Desk",
  subtitle = "RBA Sales",
  userInitial = "S",
  userName = "Sales Rep",
  showBack = false,
  backHref = "/sales",
}: SalesHeaderProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on path change or escape key
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    if (drawerOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="bg-slate-900 text-white px-5 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+1rem))] pb-4 sticky top-0 z-20 shadow-sm border-b border-slate-800">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {showBack && (
              <Link
                href={backHref}
                aria-label="Back"
                className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            <div>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5">
                {subtitle}
              </p>
              <h1 className="text-[16px] font-bold tracking-tight leading-none text-slate-50">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open sales navigation menu"
              aria-expanded={drawerOpen}
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Hamburger Menu Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Body */}
          <div
            ref={drawerRef}
            className="relative w-72 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200"
          >
            {/* Header */}
            <div className="px-5 pt-[max(1.25rem,calc(env(safe-area-inset-top,0px)+1.25rem))] pb-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold text-sm flex items-center justify-center">
                  {userInitial}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-100 truncate">{userName}</p>
                  <p className="text-[10px] text-emerald-400 font-medium">Sales Portal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Resources Section */}
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                  Resources
                </p>
                <div className="space-y-1">
                  <Link
                    href="/sales/brochures"
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      pathname === "/sales/brochures"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 text-emerald-600 shrink-0"
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
              </div>

              {/* Account Section */}
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                  Account
                </p>
                <div className="space-y-1">
                  <Link
                    href="/sales/settings"
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      pathname === "/sales/settings"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 text-slate-500 shrink-0"
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
                    <span>Settings</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Footer / Sign out */}
            <div className="p-4 border-t border-slate-100">
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-bold text-xs transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
