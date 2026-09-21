"use client";

import { useEffect, useState } from "react";
import {
  getNotificationPermission,
  requestNotificationPermission,
  type DesktopNotificationPermission,
} from "@/lib/notifications/desktop";

export function NotificationPermissionButton() {
  const [permission, setPermission] = useState<DesktopNotificationPermission>("unsupported");
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  if (permission === "unsupported") {
    return null;
  }

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const nextPermission = await requestNotificationPermission();
      setPermission(nextPermission);
    } finally {
      setIsRequesting(false);
    }
  };

  if (permission === "granted") {
    return (
      <div
        className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-md text-xs font-medium py-2 px-2.5 shadow-2xs cursor-default select-none"
        title="Desktop notifications are enabled for new leads when this tab is in the background."
        aria-label="Desktop notifications active"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
        <svg
          className="w-3.5 h-3.5 text-emerald-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span className="hidden sm:inline">Desktop Alerts Active</span>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div
        className="inline-flex items-center gap-1.5 border border-amber-200 bg-amber-50 text-amber-800 rounded-md text-xs font-medium py-2 px-2.5 shadow-2xs cursor-help select-none"
        title="Desktop notifications are blocked by your browser. Click the site settings icon (lock or tune icon) in your browser address bar to allow notifications."
        aria-label="Desktop alerts blocked"
      >
        <svg
          className="w-3.5 h-3.5 text-amber-600 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
        <span className="hidden sm:inline">Alerts Blocked</span>
      </div>
    );
  }

  // Default state: not enabled yet
  return (
    <button
      type="button"
      onClick={handleEnable}
      disabled={isRequesting}
      className="inline-flex items-center gap-1.5 border border-line bg-panel hover:bg-canvas text-ink rounded-md text-xs font-medium py-2 px-2.5 transition-colors shadow-2xs cursor-pointer"
      title="Enable native Windows desktop alerts for new leads when this tab is minimized or in the background."
      aria-label="Enable desktop alerts"
    >
      <svg
        className={`w-3.5 h-3.5 text-accent shrink-0 ${isRequesting ? "animate-spin" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span>{isRequesting ? "Enabling..." : "Enable Desktop Alerts"}</span>
    </button>
  );
}

