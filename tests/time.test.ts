import { describe, it, expect } from "vitest";
import { getIstBusinessDayWindow } from "../src/lib/time";

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

