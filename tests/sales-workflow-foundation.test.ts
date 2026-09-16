import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordContactOutcomeAction, scheduleSiteVisitAction, startBookingAction, recordTokenAndCloseAction } from "../src/app/sales/workflow-actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
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

describe("Sales Workflow Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockEq.mockReturnValue({ single: mockSingle });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSingle.mockResolvedValue({ data: { id: "visit-1", lead_stage: "NEW", assigned_to: "user-1", rnr_streak: 0 } });
    mockUser = { id: "user-1", app_metadata: { role: "sales" } };
  });

  describe("recordContactOutcomeAction", () => {
    it("keeps stage as NEW for No Answer", async () => {
      const res = await recordContactOutcomeAction("123e4567-e89b-12d3-a456-426614174000", "No Answer");
      expect(res.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        lead_stage: "NEW",
        rnr_streak: 1,
        disposition: "No Answer",
        crm_disposition: "Contacted — No Answer",
      }));
    });

    it("changes stage to CONTACTED when Connected", async () => {
      const res = await recordContactOutcomeAction("123e4567-e89b-12d3-a456-426614174000", "Connected");
      expect(res.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        lead_stage: "CONTACTED",
        rnr_streak: 0,
        disposition: "Connected",
        crm_disposition: "Contacted — Interested",
      }));
    });
    
    it("rejects unauthorized sales user", async () => {
      mockSingle.mockResolvedValue({ data: { lead_stage: "NEW", assigned_to: "user-2", rnr_streak: 0 } });
      const res = await recordContactOutcomeAction("123e4567-e89b-12d3-a456-426614174000", "Connected");
      expect(res.error).toBe("Not authorized to update this lead.");
    });
  });


  describe("scheduleSiteVisitAction", () => {
    it("changes stage to SITE_VISIT", async () => {
      mockSelect.mockReturnValueOnce({ eq: mockEq }); // for lead
      mockSelect.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ count: 0 }) }); // for count
      
      const res = await scheduleSiteVisitAction("123e4567-e89b-12d3-a456-426614174000", { scheduled_at: "2023-10-10T10:00:00Z" });
      expect(res.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        lead_stage: "SITE_VISIT"
      }));
    });
  });

  describe("startBookingAction", () => {
    it("changes stage to BOOKING", async () => {
      const res = await startBookingAction("123e4567-e89b-12d3-a456-426614174000", "Unit 101");
      expect(res.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        lead_stage: "BOOKING",
        booking_unit_details: "Unit 101",
        crm_disposition: "Site Visit Done",
      }));
    });
  });

  describe("recordTokenAndCloseAction", () => {
    it("changes stage to CLOSED", async () => {
      const res = await recordTokenAndCloseAction("123e4567-e89b-12d3-a456-426614174000", {
        amount: 50000,
        payment_method: "Bank Transfer",
        reference_number: "REF123",
        received_at: "2023-10-10T10:00:00Z"
      });
      expect(res.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        lead_stage: "CLOSED",
        lead_status: "closed",
        token_amount: 50000,
        crm_disposition: "Closed — Won",
      }));
    });
  });
});

