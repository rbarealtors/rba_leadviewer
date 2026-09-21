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

  // When unsupported or already granted/enabled, do not display the button
  if (permission === "unsupported" || permission === "granted") {
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

  // Not enabled yet ("default"): show the enable button
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
