import { describe, it, expect } from "vitest";
import {
  parseLeadsUrlParams,
  buildLeadsUrlQuery,
  DEFAULT_FILTER_PARAMS,
} from "../src/lib/leads/filters-url";

describe("filters-url", () => {
  it("returns default filter params when URL parameters are empty", () => {
    const params = new URLSearchParams("");
    const parsed = parseLeadsUrlParams(params);
    expect(parsed).toEqual(DEFAULT_FILTER_PARAMS);
  });

  it("parses valid query parameters correctly", () => {
    const params = new URLSearchParams(
      "date=yesterday&source=meta_ads&campaign=Shyam+Kunj&search=Rajesh&view=new&sort=name&dir=asc"
    );
    const parsed = parseLeadsUrlParams(params);

    expect(parsed.datePreset).toBe("yesterday");
    expect(parsed.source).toBe("meta_ads");
    expect(parsed.campaign).toBe("Shyam Kunj");
    expect(parsed.search).toBe("Rajesh");
    expect(parsed.view).toBe("new");
    expect(parsed.sortKey).toBe("name");
    expect(parsed.sortDir).toBe("asc");
  });

  it("normalizes legacy aliases like last7 and last30 to last7days and last30days", () => {
    const p1 = new URLSearchParams("date=last7");
    expect(parseLeadsUrlParams(p1).datePreset).toBe("last7days");

    const p2 = new URLSearchParams("date=last30");
    expect(parseLeadsUrlParams(p2).datePreset).toBe("last30days");
  });

  it("safely falls back to default values for invalid parameters", () => {
    const params = new URLSearchParams(
      "date=invalid_date&source=invalid_source&view=unknown&sort=hack&dir=sideways"
    );
    const parsed = parseLeadsUrlParams(params);

    expect(parsed.datePreset).toBe("today");
    expect(parsed.source).toBe("all");
    expect(parsed.view).toBe("all");
    expect(parsed.sortKey).toBe("time");
    expect(parsed.sortDir).toBe("desc");
  });

  it("parses custom date from and to properly", () => {
    const params = new URLSearchParams("date=custom&from=2026-09-01&to=2026-09-15");
    const parsed = parseLeadsUrlParams(params);

    expect(parsed.datePreset).toBe("custom");
    expect(parsed.customFrom).toBe("2026-09-01");
    expect(parsed.customTo).toBe("2026-09-15");
  });

  it("omits default values when building query string", () => {
    const query = buildLeadsUrlQuery(DEFAULT_FILTER_PARAMS);
    expect(query).toBe("");
  });

  it("builds query string correctly with non-default values", () => {
    const query = buildLeadsUrlQuery({
      ...DEFAULT_FILTER_PARAMS,
      datePreset: "yesterday",
      source: "meta_ads",
      campaign: "Shyam Kunj",
      search: "Rajesh",
    });

    expect(query).toContain("search=Rajesh");
    expect(query).toContain("date=yesterday");
    expect(query).toContain("source=meta_ads");
    expect(query).toContain("campaign=Shyam+Kunj");
    expect(query).not.toContain("view=");
    expect(query).not.toContain("sort=");
  });

  it("serializes custom date parameters when preset is custom", () => {
    const query = buildLeadsUrlQuery({
      ...DEFAULT_FILTER_PARAMS,
      datePreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-15",
    });

    expect(query).toContain("date=custom");
    expect(query).toContain("from=2026-09-01");
    expect(query).toContain("to=2026-09-15");
  });

  it("does not serialize pagination fields (page, pageSize)", () => {
    const query = buildLeadsUrlQuery(DEFAULT_FILTER_PARAMS);
    expect(query).not.toContain("page");
    expect(query).not.toContain("pageSize");
  });
});

