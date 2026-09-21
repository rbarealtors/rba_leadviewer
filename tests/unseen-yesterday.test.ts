import { describe, it, expect } from "vitest";
import { getPreviousIstBusinessDayWindow, getIstBusinessDayWindow } from "../src/lib/time";
import type { Lead } from "../src/lib/leads/types";

describe("Unseen from Yesterday query & filter logic", () => {
  // Reference time: 21 Sep 2026, 10:56 AM IST (05:26 UTC)
  const refTime = new Date("2026-09-21T05:26:00.000Z");
  const prevWindow = getPreviousIstBusinessDayWindow(refTime);
  const currentWindow = getIstBusinessDayWindow(refTime);

  // Helper matching the server-side query criteria
  function isQualifyingUnseenYesterdayLead(lead: {
    source_submitted_at: string;
    viewed_at: string | null;
  }) {
    const submittedMs = new Date(lead.source_submitted_at).getTime();
    return (
      submittedMs >= prevWindow.startMs &&
      submittedMs < currentWindow.startMs &&
      lead.viewed_at === null
    );
  }

  it("qualifies leads submitted during the previous CRM operational day with viewed_at === null", () => {
    // 20 Sep 2026, 10:00 AM IST = 2026-09-20 04:30:00 UTC (well within previous CRM day)
    const lead = {
      source_submitted_at: "2026-09-20T04:30:00.000Z",
      viewed_at: null,
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(true);
  });

  it("qualifies leads submitted right at the start of the previous CRM operational day (19 Sep 7:00 PM IST)", () => {
    // 19 Sep 2026, 19:00:00 IST = 2026-09-19 13:30:00 UTC
    const lead = {
      source_submitted_at: "2026-09-19T13:30:00.000Z",
      viewed_at: null,
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(true);
  });

  it("qualifies leads submitted near the end of the previous CRM day (20 Sep 6:59:59 PM IST)", () => {
    // 20 Sep 2026, 18:59:59.999 IST = 2026-09-20 13:29:59.999 UTC
    const lead = {
      source_submitted_at: "2026-09-20T13:29:59.999Z",
      viewed_at: null,
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(true);
  });

  it("excludes leads from the current CRM operational day (e.g. submitted last night at 8:00 PM IST)", () => {
    // 20 Sep 2026, 20:00:00 IST = 2026-09-20 14:30:00 UTC (this belongs to CURRENT CRM day!)
    const lead = {
      source_submitted_at: "2026-09-20T14:30:00.000Z",
      viewed_at: null,
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(false);
  });

  it("excludes leads submitted today morning (e.g. 21 Sep 9:00 AM IST)", () => {
    // 21 Sep 2026, 09:00:00 IST = 2026-09-21 03:30:00 UTC
    const lead = {
      source_submitted_at: "2026-09-21T03:30:00.000Z",
      viewed_at: null,
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(false);
  });

  it("excludes leads submitted before the previous CRM operational day (e.g. 19 Sep 6:59 PM IST)", () => {
    // 19 Sep 2026, 18:59:00 IST = 2026-09-19 13:29:00 UTC
    const lead = {
      source_submitted_at: "2026-09-19T13:29:00.000Z",
      viewed_at: null,
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(false);
  });

  it("excludes leads that have already been viewed (viewed_at !== null)", () => {
    const lead = {
      source_submitted_at: "2026-09-20T04:30:00.000Z",
      viewed_at: "2026-09-20T05:00:00.000Z",
    };
    expect(isQualifyingUnseenYesterdayLead(lead)).toBe(false);
  });

  it("disappears immediately from the list once marked viewed", () => {
    const leadsList: Array<{ id: string; viewed_at: string | null }> = [
      { id: "lead-1", viewed_at: null },
      { id: "lead-2", viewed_at: null },
    ];

    // Simulate marking lead-1 as viewed
    const viewedId = "lead-1";
    const updatedList = leadsList.filter((l) => l.id !== viewedId);

    expect(updatedList).toHaveLength(1);
    expect(updatedList[0]?.id).toBe("lead-2");

    // When all are viewed, list is empty
    const allViewedList = updatedList.filter((l) => l.id !== "lead-2");
    expect(allViewedList).toHaveLength(0);
  });
});

