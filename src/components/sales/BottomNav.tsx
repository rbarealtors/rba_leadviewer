"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InboxIcon, ListIcon, MapPinIcon, ClockIcon, UserCircleIcon } from "./icons";

export function BottomNav() {
  const pathname = usePathname();

  // If viewing a specific lead detail page, hide bottom nav in favor of the contextual action bar
  if (pathname.startsWith("/sales/leads/")) {
    return null;
  }

  const tabs = [
    {
      name: "Action Desk",
      href: "/sales",
      icon: InboxIcon,
      exact: true,
    },
    {
      name: "Follow-Ups",
      href: "/sales/follow-ups",
      icon: ClockIcon,
      exact: false,
    },
    {
      name: "Pipeline",
      href: "/sales/pipeline",
      icon: ListIcon,
      exact: false,
    },
    {
      name: "Visits",
      href: "/sales/visits",
      icon: MapPinIcon,
      exact: false,
    },
    {
      name: "Settings",
      href: "/sales/settings",
      icon: UserCircleIcon,
      exact: false,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 w-full md:max-w-md md:mx-auto bg-white border-t border-slate-200 px-3 sm:px-6 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-between items-center z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:border-x">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`flex flex-col items-center gap-1 py-0.5 px-2 transition-colors ${
              isActive ? "text-slate-900 font-bold" : "text-slate-400 hover:text-slate-600 font-medium"
            }`}
          >
            <Icon strokeWidth={isActive ? 2.5 : 2} className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] tracking-tight">{tab.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
