import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isNotificationSupported,
  getNotificationPermission,
  showLeadDesktopNotification,
  formatSourceLabel,
} from "../src/lib/notifications/desktop";
import type { Lead } from "../src/lib/leads/types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-uuid-1234",
    source: "meta_ads",
    external_lead_id: "ext-1",
    full_name: "Rajesh Sharma",
    phone_number: "+919876543210",
    email: "rajesh@example.com",
    campaign_name: "Shyam Kunj",
    ad_group_name: null,
    ad_name: null,
    budget_range: null,
    bhk_configuration: null,
    planning_timeline: null,
    platform: null,
    source_submitted_at: "2026-09-21T06:00:00.000Z",
    created_at: "2026-09-21T06:00:01.000Z",
    viewed_at: null,
    raw_payload: {},
    ...overrides,
  };
}

describe("desktop notifications", () => {
  let mockNotificationConstructor: any;

  beforeEach(() => {
    mockNotificationConstructor = vi.fn().mockImplementation(function (
      this: any,
      title: string,
      options: any
    ) {
      this.title = title;
      this.options = options;
      this.close = vi.fn();
    });
    mockNotificationConstructor.permission = "granted";
    mockNotificationConstructor.requestPermission = vi.fn().mockResolvedValue("granted");

    // Setup global window, document, and Notification for Node test environment
    (global as any).window = {
      Notification: mockNotificationConstructor,
      focus: vi.fn(),
    };
    (global as any).document = {
      visibilityState: "visible",
    };
    (global as any).Notification = mockNotificationConstructor;
  });

  afterEach(() => {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).Notification;
    vi.restoreAllMocks();
  });

  it("checks if notifications are supported", () => {
    expect(isNotificationSupported()).toBe(true);
    expect(getNotificationPermission()).toBe("granted");
  });

  it("formats sources into user-friendly names", () => {
    expect(formatSourceLabel("meta_ads")).toBe("Meta Ads");
    expect(formatSourceLabel("google_ads")).toBe("Google Ads");
    expect(formatSourceLabel("99acres")).toBe("99acres");
    expect(formatSourceLabel("magicbricks")).toBe("MagicBricks");
  });

  it("does NOT show desktop notification when CRM tab is visible", () => {
    (global as any).document.visibilityState = "visible";

    const lead = makeLead();
    const result = showLeadDesktopNotification(lead);

    expect(result).toBeNull();
    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it("shows desktop notification when CRM tab is hidden (in the background) and permission is granted", () => {
    (global as any).document.visibilityState = "hidden";

    const lead = makeLead();
    const onClick = vi.fn();
    const notification = showLeadDesktopNotification(lead, { onClick });

    expect(notification).not.toBeNull();
    expect(mockNotificationConstructor).toHaveBeenCalledWith(
      "New lead: Rajesh Sharma",
      expect.objectContaining({
        body: "Meta Ads · Shyam Kunj",
        icon: "/icon-192.png",
        tag: "lead-lead-uuid-1234",
      })
    );

    // Test click behavior
    if (notification) {
      notification.onclick?.(new Event("click"));
      expect((global as any).window.focus).toHaveBeenCalled();
      expect(onClick).toHaveBeenCalled();
    }
  });

  it("does NOT show desktop notification if permission is denied or default", () => {
    (global as any).document.visibilityState = "hidden";
    mockNotificationConstructor.permission = "denied";

    const lead = makeLead();
    const result = showLeadDesktopNotification(lead);

    expect(result).toBeNull();
    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });
});

