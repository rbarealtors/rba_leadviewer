import { describe, it, expect } from "vitest";
import { getIstBusinessDayWindow, getPreviousIstBusinessDayWindow, formatLeadDateTime } from "../src/lib/time";




describe("getIstBusinessDayWindow", () => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  it("calculates window correctly when current IST hour < 19 (e.g. 11:00 AM IST)", () => {
    // 2026-09-05 11:00:00 IST = 2026-09-05 05:30:00 UTC
    const ref = new Date("2026-09-05T05:30:00.000Z");
    const window = getIstBusinessDayWindow(ref);

    // Window start = Yesterday (Sep 4) at 19:00:00 IST = Sep 4 at 13:30:00.000 UTC
    expect(window.startIso).toBe("2026-09-04T13:30:00.000Z");
    // Window end = Today (Sep 5) at 18:59:59.999 IST = Sep 5 at 13:29:59.999 UTC
    expect(window.endIso).toBe("2026-09-05T13:29:59.999Z");
    expect(ref.getTime()).toBeGreaterThanOrEqual(window.startMs);
    expect(ref.getTime()).toBeLessThanOrEqual(window.endMs);
  });

  it("calculates window correctly when current IST hour >= 19 (e.g. 7:30 PM IST)", () => {
    // 2026-09-05 19:30:00 IST = 2026-09-05 14:00:00 UTC
    const ref = new Date("2026-09-05T14:00:00.000Z");
    const window = getIstBusinessDayWindow(ref);

    // Window start = Today (Sep 5) at 19:00:00 IST = Sep 5 at 13:30:00.000 UTC
    expect(window.startIso).toBe("2026-09-05T13:30:00.000Z");
    // Window end = Tomorrow (Sep 6) at 18:59:59.999 IST = Sep 6 at 13:29:59.999 UTC
    expect(window.endIso).toBe("2026-09-06T13:29:59.999Z");
    expect(ref.getTime()).toBeGreaterThanOrEqual(window.startMs);
    expect(ref.getTime()).toBeLessThanOrEqual(window.endMs);
  });

  it("handles exact threshold boundary at 18:59:59.999 IST (hour 18)", () => {
    // 2026-09-05 18:59:59.999 IST = 2026-09-05 13:29:59.999 UTC
    const ref = new Date("2026-09-05T13:29:59.999Z");
    const window = getIstBusinessDayWindow(ref);

    expect(window.startIso).toBe("2026-09-04T13:30:00.000Z");
    expect(window.endIso).toBe("2026-09-05T13:29:59.999Z");
  });

  it("handles exact threshold boundary at 19:00:00.000 IST (hour 19)", () => {
    // 2026-09-05 19:00:00.000 IST = 2026-09-05 13:30:00.000 UTC
    const ref = new Date("2026-09-05T13:30:00.000Z");
    const window = getIstBusinessDayWindow(ref);

    expect(window.startIso).toBe("2026-09-05T13:30:00.000Z");
    expect(window.endIso).toBe("2026-09-06T13:29:59.999Z");
  });

  it("handles month boundary rollover (e.g. Sep 1 at 02:00 IST starts Aug 31 at 19:00 IST)", () => {
    // 2026-09-01 02:00:00 IST = 2026-08-31 20:30:00 UTC
    const ref = new Date("2026-08-31T20:30:00.000Z");
    const window = getIstBusinessDayWindow(ref);

    expect(window.startIso).toBe("2026-08-31T13:30:00.000Z");
    expect(window.endIso).toBe("2026-09-01T13:29:59.999Z");
  });

  it("handles year boundary rollover (e.g. Jan 1 at 02:00 IST starts Dec 31 at 19:00 IST)", () => {
    // 2027-01-01 02:00:00 IST = 2026-12-31 20:30:00 UTC
    const ref = new Date("2026-12-31T20:30:00.000Z");
    const window = getIstBusinessDayWindow(ref);

    expect(window.startIso).toBe("2026-12-31T13:30:00.000Z");
    expect(window.endIso).toBe("2027-01-01T13:29:59.999Z");
  });

  it("handles leap year leap day rollover (e.g. March 1, 2024 at 10:00 IST starts Feb 29 at 19:00 IST)", () => {
    // 2024-03-01 10:00:00 IST = 2024-03-01 04:30:00 UTC
    const ref = new Date("2024-03-01T04:30:00.000Z");
    const window = getIstBusinessDayWindow(ref);

    expect(window.startIso).toBe("2024-02-29T13:30:00.000Z");
    expect(window.endIso).toBe("2024-03-01T13:29:59.999Z");
  });
});

describe("getPreviousIstBusinessDayWindow", () => {
  it("calculates previous window correctly when current IST hour < 19 (e.g. 10:56 AM IST on 21 Sep 2026)", () => {
    // Current IST: 21 Sep 2026 10:56:00 IST = 2026-09-21 05:26:00 UTC
    // Current CRM window: 20 Sep 19:00:00 IST -> 21 Sep 18:59:59.999 IST
    // Previous CRM window: 19 Sep 19:00:00 IST -> 20 Sep 18:59:59.999 IST
    const ref = new Date("2026-09-21T05:26:00.000Z");
    const prev = getPreviousIstBusinessDayWindow(ref);

    // 19 Sep 19:00:00 IST = 19 Sep 13:30:00.000 UTC
    expect(prev.startIso).toBe("2026-09-19T13:30:00.000Z");
    // 20 Sep 18:59:59.999 IST = 20 Sep 13:29:59.999 UTC
    expect(prev.endIso).toBe("2026-09-20T13:29:59.999Z");
    // Exclusive boundary = start of current window (20 Sep 19:00:00 IST = 20 Sep 13:30:00.000 UTC)
    expect(prev.exclusiveEndIso).toBe("2026-09-20T13:30:00.000Z");
  });

  it("calculates previous window correctly when current IST hour >= 19 (e.g. 8:00 PM IST on 21 Sep 2026)", () => {
    // Current IST: 21 Sep 2026 20:00:00 IST = 2026-09-21 14:30:00 UTC
    // Current CRM window: 21 Sep 19:00:00 IST -> 22 Sep 18:59:59.999 IST
    // Previous CRM window: 20 Sep 19:00:00 IST -> 21 Sep 18:59:59.999 IST
    const ref = new Date("2026-09-21T14:30:00.000Z");
    const prev = getPreviousIstBusinessDayWindow(ref);

    // 20 Sep 19:00:00 IST = 20 Sep 13:30:00.000 UTC
    expect(prev.startIso).toBe("2026-09-20T13:30:00.000Z");
    // 21 Sep 18:59:59.999 IST = 21 Sep 13:29:59.999 UTC
    expect(prev.endIso).toBe("2026-09-21T13:29:59.999Z");
    expect(prev.exclusiveEndIso).toBe("2026-09-21T13:30:00.000Z");
  });

  it("spans exactly 24 hours (86,400,000 ms)", () => {
    const ref = new Date("2026-09-21T05:26:00.000Z");
    const prev = getPreviousIstBusinessDayWindow(ref);
    expect(new Date(prev.exclusiveEndIso).getTime() - new Date(prev.startIso).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("formatLeadDateTime", () => {
  it("formats valid UTC timestamp to deterministic IST date and time", () => {
    // 2026-09-20 14:30:00 UTC = 2026-09-20 20:00:00 IST (8:00 pm)
    const { dateStr, timeStr } = formatLeadDateTime("2026-09-20T14:30:00.000Z");
    expect(dateStr).toBe("20 Sept,");
    expect(timeStr).toBe("8:00 pm");
  });

  it("handles morning and single digit hours correctly", () => {
    // 2026-09-21 03:05:00 UTC = 2026-09-21 08:35:00 IST (8:35 am)
    const { dateStr, timeStr } = formatLeadDateTime("2026-09-21T03:05:00.000Z");
    expect(dateStr).toBe("21 Sept,");
    expect(timeStr).toBe("8:35 am");
  });

  it("handles invalid date gracefully", () => {
    const { dateStr, timeStr } = formatLeadDateTime("invalid-date");
    expect(dateStr).toBe("invalid-date");
    expect(timeStr).toBe("");
  });
});


