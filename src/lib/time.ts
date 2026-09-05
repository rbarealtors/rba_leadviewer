const IST_TIME_ZONE = "Asia/Kolkata";

const displayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Formats a UTC ISO timestamp for display, e.g. "02 Sep, 11:42 AM". */
export function formatIST(isoUtc: string): string {
  const date = new Date(isoUtc);
  const parts = displayFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod");
  return `${day} ${month}, ${hour}:${minute} ${dayPeriod}`;
}

/** Start-of-day boundary in IST, returned as a UTC ISO string, for a given number of days ago. */
export function istDaysAgoStartUtc(daysAgo: number, from: Date = new Date()): string {
  // Get the current date "as seen in IST" so day boundaries line up with
  // what a person in India means by "today"/"yesterday".
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = istFormatter.format(from).split("-").map(Number);
  // IST is UTC+5:30, fixed offset (no DST). Midnight IST on day (y,m,d) is
  // (y,m,d) 00:00 minus 5:30, i.e. previous day 18:30 UTC.
  const istMidnightUtcMs =
    Date.UTC(y!, m! - 1, d!, 0, 0, 0) - 5.5 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(istMidnightUtcMs).toISOString();
}

export interface IstBusinessWindow {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
}

/**
 * Calculates the 7 PM to 7 PM IST Business Day window for a given reference time (default now).
 *
 * In IST (UTC+05:30):
 * If current IST hour < 19 (7 PM):
 *   - Window start = Yesterday at 19:00:00 IST
 *   - Window end   = Today at 18:59:59.999 IST
 * If current IST hour >= 19 (7 PM):
 *   - Window start = Today at 19:00:00 IST
 *   - Window end   = Tomorrow at 18:59:59.999 IST
 */
export function getIstBusinessDayWindow(from: Date = new Date()): IstBusinessWindow {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  // Shift to IST virtual UTC to extract IST calendar components deterministically
  const istDate = new Date(from.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth();
  const day = istDate.getUTCDate();
  const hour = istDate.getUTCHours();

  let startDay = day;
  let endDay = day;

  if (hour < 19) {
    startDay = day - 1;
  } else {
    endDay = day + 1;
  }

  const startMs = Date.UTC(year, month, startDay, 19, 0, 0, 0) - IST_OFFSET_MS;
  const endMs = Date.UTC(year, month, endDay, 18, 59, 59, 999) - IST_OFFSET_MS;

  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

