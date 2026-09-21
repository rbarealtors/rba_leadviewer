import type { Lead, LeadSource } from "../leads/types";

export type DesktopNotificationPermission = NotificationPermission | "unsupported";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): DesktopNotificationPermission {
  if (!isNotificationSupported()) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (!isNotificationSupported()) {
    return "unsupported";
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error("Failed to request notification permission:", error);
    return Notification.permission;
  }
}

export function formatSourceLabel(source: LeadSource | string | null | undefined): string {
  switch (source) {
    case "google_ads":
      return "Google Ads";
    case "meta_ads":
      return "Meta Ads";
    case "99acres":
      return "99acres";
    case "magicbricks":
      return "MagicBricks";
    case "direct_walk_in":
      return "Direct Walk-in";
    case "phone_call":
      return "Phone Call";
    case "referral":
      return "Referral";
    case "facebook_sheets_bridge":
      return "Facebook Bridge";
    default:
      return source ? String(source) : "Direct";
  }
}

export interface ShowNotificationOptions {
  onClick?: () => void;
  forceShowWhenVisible?: boolean;
}

/**
 * Displays a native browser/Windows desktop notification for a newly arrived lead.
 *
 * Requirements:
 * 1. Web Notification API is supported and permission is 'granted'.
 * 2. Tab is in the background (document.visibilityState !== 'visible'), unless forced.
 * 3. Uses a stable tag based on lead ID to prevent duplicate popups.
 * 4. Concise title and body without sensitive or raw payload data.
 */
export function showLeadDesktopNotification(
  lead: Lead,
  options: ShowNotificationOptions = {}
): Notification | null {
  if (!isNotificationSupported()) {
    return null;
  }

  if (Notification.permission !== "granted") {
    return null;
  }

  // Only notify if tab is in the background, unless explicitly forced
  if (!options.forceShowWhenVisible && typeof document !== "undefined" && document.visibilityState === "visible") {
    return null;
  }

  try {
    const leadName = lead.full_name ? lead.full_name.trim() : "New Inquiry";
    const sourceLabel = formatSourceLabel(lead.source);
    const campaignLabel = lead.campaign_name ? lead.campaign_name.trim() : "";
    const details = campaignLabel ? `${sourceLabel} · ${campaignLabel}` : sourceLabel;

    const title = `New lead: ${leadName}`;
    const body = details;

    const notification = new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag: `lead-${lead.id}`,
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // window.focus can be restricted by browser policy in some contexts
      }
      if (options.onClick) {
        options.onClick();
      }
      try {
        notification.close();
      } catch {
        // ignore
      }
    };

    return notification;
  } catch (error) {
    console.error("Failed to show desktop notification:", error);
    return null;
  }
}

