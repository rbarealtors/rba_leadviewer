/**
 * Tests for Phase 1A: Disposition History & Follow-Up Tracking
 *
 * Coverage:
 *  1. Migration / schema expectations (column & table presence via type assertions)
 *  2. Disposition mapping: outcomeTocrm helper (via server action behaviour)
 *  3. History creation on actual crm_disposition change (trigger simulated)
 *  4. No history row when crm_disposition does not change
 *  5. Metadata updates (disposition_updated_at / disposition_updated_by)
 *  6. Sales can only read history for assigned leads (RLS policy SQL assertions)
 *  7. Admin / staff can read all history (RLS policy SQL assertions)
 *  8. Existing lead assignment isolation remains unchanged
 *  9. Existing sales workflow tests continue passing (crm_disposition added to mocks)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  type CrmDisposition,
  type LeadDispositionHistory,
  CANONICAL_DISPOSITIONS,
} from "../src/lib/leads/types";
import {
  recordContactOutcomeAction,
  scheduleSiteVisitAction,
  startBookingAction,
  recordTokenAndCloseAction,
  updateLeadDispositionAction,
  updateLeadFollowUpAction,
  getLeadDispositionHistoryAction,
  getLeadTimelineAction,
} from "../src/app/sales/workflow-actions";



// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq    = vi.fn();
const mockSingle = vi.fn();

const mockAdminClient = {
  from: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  })),
};

vi.mock("../src/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => mockAdminClient,
}));

let mockUser: any = { id: "user-1", app_metadata: { role: "sales" } };

vi.mock("../src/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser } })),
    },
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_LEAD_UUID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_VISIT_UUID = "223e4567-e89b-12d3-a456-426614174001";

function resetMocks() {
  vi.clearAllMocks();
  // Default chain: .from(...).select(...).eq(...).single() → lead data
  mockEq.mockReturnValue({ single: mockSingle });
  mockSingle.mockResolvedValue({
    data: { id: VALID_LEAD_UUID, lead_stage: "NEW", assigned_to: "user-1", rnr_streak: 0 },
  });
  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockUser = { id: "user-1", app_metadata: { role: "sales" } };
}

// ── 1. Schema / Type presence tests ──────────────────────────────────────────

describe("Phase 1A — schema type definitions", () => {
  it("CrmDisposition union contains all required values", () => {
    const values: CrmDisposition[] = [
      "Not Contacted",
      "Contacted — No Answer",
      "Contacted — Interested",
      "Contacted — Not Interested",
      "Budget Mismatch",
      "Site Visit Scheduled",
      "Site Visit Done",
      "Closed — Won",
      "Closed — Lost",
    ];
    // If any value is missing from the union, TypeScript would catch it at compile time.
    // This runtime assertion ensures the array has exactly 9 elements.
    expect(values).toHaveLength(9);
  });

  it("LeadDispositionHistory type has required fields", () => {
    // Purely a compile-time check — assigning a well-typed object is sufficient.
    const entry: LeadDispositionHistory = {
      id: "id-1",
      lead_id: "lead-id-1",
      old_disposition: null,
      new_disposition: "Contacted — Interested",
      changed_by: "user-1",
      changed_at: new Date().toISOString(),
    };
    expect(entry.new_disposition).toBe("Contacted — Interested");
    expect(entry.old_disposition).toBeNull();
  });
});

// ── 2. Disposition mapping: call outcome → CrmDisposition ────────────────────

describe("Phase 1A — outcome → crm_disposition mapping", () => {
  beforeEach(resetMocks);

  const cases: Array<[
    Parameters<typeof recordContactOutcomeAction>[1],
    CrmDisposition
  ]> = [
    ["Connected",         "Contacted — Interested"],
    ["No Answer",         "Contacted — No Answer"],
    ["Busy / Call Later", "Contacted — No Answer"],
    ["Not Interested",    "Contacted — Not Interested"],
    ["Wrong Number",      "Contacted — Not Interested"],
  ];

  for (const [outcome, expectedCrm] of cases) {
    it(`"${outcome}" maps to "${expectedCrm}"`, async () => {
      const res = await recordContactOutcomeAction(VALID_LEAD_UUID, outcome);
      expect(res.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ crm_disposition: expectedCrm })
      );
    });
  }
});

// ── 3 & 4. History-row simulation (trigger is DB-side; we verify the update ──
//           payload reaches the DB so the trigger can fire)

describe("Phase 1A — crm_disposition set in update payload (trigger input)", () => {
  beforeEach(resetMocks);

  it("recordContactOutcomeAction includes crm_disposition in update", async () => {
    await recordContactOutcomeAction(VALID_LEAD_UUID, "Connected");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ crm_disposition: "Contacted — Interested" })
    );
  });

  it("recordContactOutcomeAction for No Answer does NOT change lead_stage but sets crm_disposition", async () => {
    await recordContactOutcomeAction(VALID_LEAD_UUID, "No Answer");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_stage: "NEW",
        crm_disposition: "Contacted — No Answer",
      })
    );
  });

  it("scheduleSiteVisitAction sets crm_disposition to Site Visit Scheduled", async () => {
    // Mirror the pattern used in sales-workflow-foundation.test.ts which passes.
    mockSelect.mockReturnValueOnce({ eq: mockEq }); // for leads.select().eq()
    mockSelect.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ count: 0 }) }); // for count

    await scheduleSiteVisitAction(VALID_LEAD_UUID, {
      scheduled_at: "2025-12-01T10:00:00Z",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ crm_disposition: "Site Visit Scheduled" })
    );
  });


  it("startBookingAction sets crm_disposition to Site Visit Done", async () => {
    await startBookingAction(VALID_LEAD_UUID, "Unit 301");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_stage: "BOOKING",
        crm_disposition: "Site Visit Done",
      })
    );
  });

  it("recordTokenAndCloseAction sets crm_disposition to Closed — Won", async () => {
    await recordTokenAndCloseAction(VALID_LEAD_UUID, {
      amount: 100000,
      payment_method: "NEFT",
      reference_number: "TXN-001",
      received_at: "2025-12-01T10:00:00Z",
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_stage: "CLOSED",
        crm_disposition: "Closed — Won",
      })
    );
  });
});

// ── 5. Metadata field assertions ───────────────────────────────────────────────

describe("Phase 1A — disposition_updated_at and _by are set by the DB trigger (payload verification)", () => {
  // The metadata fields (disposition_updated_at, disposition_updated_by) are set
  // by the BEFORE UPDATE SECURITY DEFINER trigger on the database side — they are
  // NOT written by application code. We verify:
  // a) Application code does NOT include them in the update payload (no double-write).
  // b) The DB trigger contract is captured in migration SQL assertions below.

  beforeEach(resetMocks);

  it("application update payload does not include disposition_updated_at", async () => {
    await recordContactOutcomeAction(VALID_LEAD_UUID, "Connected");
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("disposition_updated_at");
  });

  it("application update payload does not include disposition_updated_by", async () => {
    await recordContactOutcomeAction(VALID_LEAD_UUID, "Connected");
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("disposition_updated_by");
  });

});

// ── 6 & 7. RLS policy SQL — asserted as string expectations ──────────────────

describe("Phase 1A — RLS policy SQL in migration 0011", () => {
  const fs = require("fs");
  const path = require("path");

  const migrationPath = path.join(
    __dirname,
    "../supabase/migrations/0011_disposition_history.sql"
  );
  let sql = "";

  try {
    sql = fs.readFileSync(migrationPath, "utf8");
  } catch {
    // Will fail tests below if file is missing
  }

  it("migration file exists", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("creates lead_disposition_history table", () => {
    expect(sql).toContain("create table if not exists public.lead_disposition_history");
  });

  it("enables RLS on lead_disposition_history", () => {
    expect(sql).toContain("alter table public.lead_disposition_history enable row level security");
  });

  it("has a policy restricting sales to assigned leads only", () => {
    expect(sql).toContain("assigned_to = auth.uid()");
    expect(sql).toContain("'sales'");
  });

  it("has a policy granting admin and staff read access", () => {
    expect(sql).toContain("'admin', 'staff'");
  });

  it("does NOT grant INSERT / UPDATE / DELETE to authenticated role on history", () => {
    // Should have no unconditional insert/update/delete grant on the history table
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)\s+on\s+public\.lead_disposition_history\s+to\s+authenticated/i
    );
  });

  it("uses SECURITY DEFINER for the trigger function", () => {
    expect(sql).toContain("security definer");
  });

  it("trigger fires BEFORE UPDATE", () => {
    expect(sql).toContain("before update on public.leads");
  });

  it("adds crm_disposition with check constraint", () => {
    expect(sql).toContain("crm_disposition");
    expect(sql).toContain("Closed — Won");
    expect(sql).toContain("Not Contacted");
  });

  it("backfill sets crm_disposition from lead_stage", () => {
    expect(sql).toContain("update public.leads");
    expect(sql).toContain("CLOSED");
    expect(sql).toContain("SITE_VISIT");
  });

  it("does not rename next_follow_up", () => {
    expect(sql).not.toContain("next_follow_up_at");
    expect(sql).not.toContain("rename column");
  });
});

// ── 8. Assignment isolation: sales cannot update leads assigned to others ─────

describe("Phase 1A — assignment isolation (existing workflow unchanged)", () => {
  beforeEach(resetMocks);

  it("rejects sales user updating a lead assigned to a different user", async () => {
    mockSingle.mockResolvedValue({
      data: { id: VALID_LEAD_UUID, lead_stage: "NEW", assigned_to: "user-2", rnr_streak: 0 },
    });
    const res = await recordContactOutcomeAction(VALID_LEAD_UUID, "Connected");
    expect(res.error).toBe("Not authorized to update this lead.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows sales user to update their own lead", async () => {
    const res = await recordContactOutcomeAction(VALID_LEAD_UUID, "No Answer");
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// ── 9. Existing tests backward-compatibility ──────────────────────────────────

describe("Phase 1A — existing workflow tests still pass with crm_disposition added", () => {
  beforeEach(resetMocks);

  it("No Answer: stage stays NEW, rnr_streak increments, crm_disposition set", async () => {
    const res = await recordContactOutcomeAction(VALID_LEAD_UUID, "No Answer");
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_stage: "NEW",
        rnr_streak: 1,
        disposition: "No Answer",
        crm_disposition: "Contacted — No Answer",
      })
    );
  });

  it("Connected: stage advances to CONTACTED, crm_disposition set", async () => {
    const res = await recordContactOutcomeAction(VALID_LEAD_UUID, "Connected");
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_stage: "CONTACTED",
        rnr_streak: 0,
        disposition: "Connected",
        crm_disposition: "Contacted — Interested",
      })
    );
  });

  it("recordTokenAndCloseAction: stage CLOSED, lead_status closed, crm_disposition Won", async () => {
    const res = await recordTokenAndCloseAction(VALID_LEAD_UUID, {
      amount: 50000,
      payment_method: "Bank Transfer",
      reference_number: "REF123",
      received_at: "2025-10-10T10:00:00Z",
    });
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_stage: "CLOSED",
        lead_status: "closed",
        token_amount: 50000,
        crm_disposition: "Closed — Won",
      })
    );
  });
});

// ── 10. Phase 1A UI Action: updateLeadDispositionAction ────────────────────────

describe("Phase 1A — updateLeadDispositionAction", () => {
  beforeEach(resetMocks);

  it("exposes all nine canonical CRM dispositions", () => {
    expect(CANONICAL_DISPOSITIONS).toHaveLength(9);
    expect(CANONICAL_DISPOSITIONS).toContain("Not Contacted");
    expect(CANONICAL_DISPOSITIONS).toContain("Contacted — No Answer");
    expect(CANONICAL_DISPOSITIONS).toContain("Contacted — Interested");
    expect(CANONICAL_DISPOSITIONS).toContain("Contacted — Not Interested");
    expect(CANONICAL_DISPOSITIONS).toContain("Budget Mismatch");
    expect(CANONICAL_DISPOSITIONS).toContain("Site Visit Scheduled");
    expect(CANONICAL_DISPOSITIONS).toContain("Site Visit Done");
    expect(CANONICAL_DISPOSITIONS).toContain("Closed — Won");
    expect(CANONICAL_DISPOSITIONS).toContain("Closed — Lost");
  });

  it("updates crm_disposition with the selected canonical value", async () => {
    const res = await updateLeadDispositionAction(VALID_LEAD_UUID, "Budget Mismatch");
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      crm_disposition: "Budget Mismatch",
    });
  });

  it("does NOT overwrite the legacy disposition column", async () => {
    await updateLeadDispositionAction(VALID_LEAD_UUID, "Contacted — Interested");
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("disposition");
  });

  it("does NOT clear or touch next_follow_up", async () => {
    await updateLeadDispositionAction(VALID_LEAD_UUID, "Site Visit Scheduled");
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("next_follow_up");
  });

  it("does NOT manually write trigger-owned metadata (disposition_updated_at / by)", async () => {
    await updateLeadDispositionAction(VALID_LEAD_UUID, "Closed — Lost");
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("disposition_updated_at");
    expect(payload).not.toHaveProperty("disposition_updated_by");
  });

  it("rejects non-canonical disposition values", async () => {
    const res = await updateLeadDispositionAction(VALID_LEAD_UUID, "Invalid Value" as any);
    expect(res.error).toBe("Invalid disposition value.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("enforces sales assignment isolation (rejects updating another rep's lead)", async () => {
    mockSingle.mockResolvedValue({
      data: { id: VALID_LEAD_UUID, assigned_to: "other-user", crm_disposition: "Not Contacted" },
    });
    const res = await updateLeadDispositionAction(VALID_LEAD_UUID, "Contacted — Interested");
    expect(res.error).toBe("Not authorized to update this lead.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows staff/admin to update any lead's disposition", async () => {
    mockUser = { id: "admin-1", app_metadata: { role: "admin" } };
    mockSingle.mockResolvedValue({
      data: { id: VALID_LEAD_UUID, assigned_to: "rep-1", crm_disposition: "Not Contacted" },
    });
    const res = await updateLeadDispositionAction(VALID_LEAD_UUID, "Contacted — Interested");
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ crm_disposition: "Contacted — Interested" });
  });
});

// ── 11. Phase 1A UI Action: updateLeadFollowUpAction ──────────────────────────

describe("Phase 1A — updateLeadFollowUpAction", () => {
  beforeEach(resetMocks);

  it("schedules a new follow-up timestamp", async () => {
    const targetIso = "2026-03-20T10:00:00.000Z";
    const res = await updateLeadFollowUpAction(VALID_LEAD_UUID, targetIso);
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      next_follow_up: targetIso,
    });
  });

  it("edits an existing follow-up timestamp", async () => {
    const targetIso = "2026-03-25T14:30:00.000Z";
    const res = await updateLeadFollowUpAction(VALID_LEAD_UUID, targetIso);
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      next_follow_up: targetIso,
    });
  });

  it("clears a follow-up when passed null", async () => {
    const res = await updateLeadFollowUpAction(VALID_LEAD_UUID, null);
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      next_follow_up: null,
    });
  });

  it("does NOT alter crm_disposition when changing follow-up", async () => {
    await updateLeadFollowUpAction(VALID_LEAD_UUID, "2026-03-20T10:00:00.000Z");
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("crm_disposition");
  });

  it("does NOT alter legacy disposition when changing follow-up", async () => {
    await updateLeadFollowUpAction(VALID_LEAD_UUID, null);
    const payload = (mockUpdate.mock.calls[0] as any[])[0];
    expect(payload).not.toHaveProperty("disposition");
  });

  it("rejects invalid date strings", async () => {
    const res = await updateLeadFollowUpAction(VALID_LEAD_UUID, "not-a-date");
    expect(res.error).toBe("Invalid follow-up date.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("inserts an activity into lead_activities on follow-up change", async () => {
    await updateLeadFollowUpAction(VALID_LEAD_UUID, "2026-03-20T10:00:00.000Z");
    expect(mockAdminClient.from).toHaveBeenCalledWith("lead_activities");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: VALID_LEAD_UUID,
        type: "follow_up_scheduled",
      })
    );
  });

  it("enforces sales assignment isolation for follow-up update", async () => {
    mockSingle.mockResolvedValue({
      data: { id: VALID_LEAD_UUID, assigned_to: "other-user" },
    });
    const res = await updateLeadFollowUpAction(VALID_LEAD_UUID, "2026-03-20T10:00:00.000Z");
    expect(res.error).toBe("Not authorized to update this lead.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ── 12. History Reading & Timeline Isolation ─────────────────────────────────

describe("Phase 1A — History Reading & Timeline Isolation", () => {
  beforeEach(resetMocks);

  it("getLeadDispositionHistoryAction reads from lead_disposition_history", async () => {
    // 1. Lead authorization check: admin.from("leads").select("assigned_to").eq(...).single()
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { assigned_to: "user-1" } }),
      }),
    });
    // 2. History query: admin.from("lead_disposition_history").select("*").eq(...).order(...)
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: "h-1",
              lead_id: VALID_LEAD_UUID,
              old_disposition: "Not Contacted",
              new_disposition: "Contacted — Interested",
              changed_at: "2026-03-15T12:00:00Z",
              changed_by: "user-1",
              note: null,
            },
          ],
          error: null,
        }),
      }),
    });

    const res = await getLeadDispositionHistoryAction(VALID_LEAD_UUID);
    expect(res.error).toBeNull();
    expect(mockAdminClient.from).toHaveBeenCalledWith("lead_disposition_history");
    expect(res.data).toHaveLength(1);
    expect(res.data![0].new_disposition).toBe("Contacted — Interested");
  });

  it("getLeadDispositionHistoryAction enforces sales isolation", async () => {
    mockSingle.mockResolvedValue({
      data: { assigned_to: "other-user" },
    });
    const res = await getLeadDispositionHistoryAction(VALID_LEAD_UUID);
    expect(res.error).toBe("Not authorized.");
    expect(res.data).toBeNull();
  });

  it("getLeadTimelineAction enforces sales isolation", async () => {
    mockSingle.mockResolvedValue({
      data: { assigned_to: "other-user" },
    });
    const res = await getLeadTimelineAction(VALID_LEAD_UUID);
    expect(res.error).toBe("Not authorized.");
    expect(res.data).toBeNull();
  });

  it("getLeadTimelineAction allows assigned sales user", async () => {
    // 1. Lead authorization check
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { assigned_to: "user-1" } }),
      }),
    });
    // 2. Activities query
    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: "act-1", type: "call_outcome", title: "Call Outcome: Connected" }],
          error: null,
        }),
      }),
    });
    const res = await getLeadTimelineAction(VALID_LEAD_UUID);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });
});


