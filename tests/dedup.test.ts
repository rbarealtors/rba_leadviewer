import { describe, it, expect } from "vitest";
import { dedupeKey } from "../src/lib/leads/search";
import { normalizeGoogleLead } from "../src/lib/leads/normalize-google";
import { normalizeMetaLead } from "../src/lib/leads/normalize-meta";

describe("dedupeKey", async () => {
  it("is stable for the same source + external_lead_id", async () => {
    const a = dedupeKey({ source: "google_ads", external_lead_id: "123456789" });
    const b = dedupeKey({ source: "google_ads", external_lead_id: "123456789" });
    expect(a).toBe(b);
  });

  it("differs across sources for the same numeric id (per spec section 7)", async () => {
    const google = dedupeKey({ source: "google_ads", external_lead_id: "123456789" });
    const meta = dedupeKey({ source: "meta_ads", external_lead_id: "123456789" });
    expect(google).not.toBe(meta);
  });

  it("differs for different lead ids from the same source", async () => {
    const a = dedupeKey({ source: "meta_ads", external_lead_id: "1" });
    const b = dedupeKey({ source: "meta_ads", external_lead_id: "2" });
    expect(a).not.toBe(b);
  });

  it("normalized Google and Meta leads produce dedupe keys consistent with their own ids", async () => {
    const googleLead = await normalizeGoogleLead({
      lead_id: "G1",
      google_key: "x",
      user_column_data: [{ column_id: "FULL_NAME", string_value: "Test" }],
    });
    const metaLead = normalizeMetaLead({
      id: "M1",
      field_data: [{ name: "full_name", values: ["Test"] }],
    });

    expect(dedupeKey(googleLead)).toBe("google_ads:G1");
    expect(dedupeKey(metaLead)).toBe("meta_ads:M1");
  });
});

/**
 * DATABASE-LEVEL IDEMPOTENCY
 * ---------------------------------------------------------------------
 * The actual duplicate-safety guarantee lives in the database: the
 * `leads_source_external_id_unique` UNIQUE (source, external_lead_id)
 * constraint in supabase/migrations/0001_init.sql, combined with both
 * webhook route handlers treating a 23505 unique_violation as a
 * successful (already-persisted) delivery rather than an error.
 *
 * That behavior needs a real Postgres instance to verify end-to-end, which
 * this sandbox does not have network access to provision. To verify it
 * against a real (e.g. local `supabase start`, or a disposable Supabase
 * project) database, run:
 *
 *   INSERT INTO leads (source, external_lead_id, source_submitted_at, raw_payload)
 *   VALUES ('google_ads', 'dup-1', now(), '{}');
 *   -- second identical insert should fail with 23505:
 *   INSERT INTO leads (source, external_lead_id, source_submitted_at, raw_payload)
 *   VALUES ('google_ads', 'dup-1', now(), '{}');
 *   -- same id, different source, should succeed (two rows):
 *   INSERT INTO leads (source, external_lead_id, source_submitted_at, raw_payload)
 *   VALUES ('meta_ads', 'dup-1', now(), '{}');
 *
 * Or exercise it through the HTTP layer by POSTing the same webhook
 * payload twice to /api/webhooks/google-ads (or /meta) against a running
 * dev server wired to a real Supabase project, and confirming exactly one
 * row exists afterward.
 */
describe.skip("database-level idempotency (requires a live Supabase instance)", async () => {
  it("documented above — run manually against a real database", async () => {
    expect(true).toBe(true);
  });
});
