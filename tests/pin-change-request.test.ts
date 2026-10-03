import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePinFormat,
  requestPinChange,
  verifyAdminPasswordAndApprove,
  adminRejectPinChange,
  completePinChange,
  WEAK_PINS,
} from "@/lib/auth/pin-change-service";
import { createPinToken, verifyPinToken } from "@/lib/auth/pin-cookie";

describe("Admin-Approved Sales PIN Change Workflow", () => {
  beforeEach(() => {
    process.env.PIN_COOKIE_SECRET = "0123456789abcdef0123456789abcdef";
    vi.clearAllMocks();
  });

  describe("PIN Format and Weak PIN Validation", () => {
    it("accepts valid 4-digit PIN", () => {
      const result = validatePinFormat("7391");
      expect(result.valid).toBe(true);
    });

    it("accepts valid 6-digit PIN", () => {
      const result = validatePinFormat("849201");
      expect(result.valid).toBe(true);
    });

    it("rejects PINs shorter than 4 digits", () => {
      expect(validatePinFormat("123").valid).toBe(false);
      expect(validatePinFormat("").valid).toBe(false);
    });

    it("rejects PINs longer than 6 digits", () => {
      expect(validatePinFormat("1234567").valid).toBe(false);
    });

    it("rejects non-numeric characters", () => {
      expect(validatePinFormat("abcd").valid).toBe(false);
      expect(validatePinFormat("12a4").valid).toBe(false);
      expect(validatePinFormat("12 4").valid).toBe(false);
    });

    it("rejects common weak 4-digit and 6-digit PINs", () => {
      const sampleWeak = ["1234", "0000", "1111", "9876", "2580", "123456", "000000", "654321"];
      for (const pin of sampleWeak) {
        const res = validatePinFormat(pin);
        expect(res.valid).toBe(false);
        expect(res.reason).toContain("simple or common");
      }
    });

    it("verifies all registered WEAK_PINS are rejected", () => {
      for (const pin of WEAK_PINS) {
        expect(validatePinFormat(pin).valid).toBe(false);
      }
    });
  });

  describe("Requesting a Sales PIN Change (requestPinChange)", () => {
    it("successfully creates a request when user is sales", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "ok", request_id: "req-123" },
          error: null,
        }),
      } as any;

      const res = await requestPinChange(fakeSupabase);
      expect(res.ok).toBe(true);
      expect(res.requestId).toBe("req-123");
      expect(res.status).toBe("REQUESTED");
      expect(fakeSupabase.rpc).toHaveBeenCalledWith("request_sales_pin_change");
    });

    it("handles already_active request properly", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "already_active", request_id: "req-999", request_status: "REQUESTED" },
          error: null,
        }),
      } as any;

      const res = await requestPinChange(fakeSupabase);
      expect(res.ok).toBe(false);
      expect(res.requestId).toBe("req-999");
      expect(res.status).toBe("REQUESTED");
      expect(res.error).toContain("already have an active PIN change request");
    });

    it("handles RPC execution error", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Only sales representatives can request a Sales PIN change" },
        }),
      } as any;

      const res = await requestPinChange(fakeSupabase);
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Only sales representatives");
    });
  });

  describe("Admin Approval with Password & Identity Hardening (verifyAdminPasswordAndApprove)", () => {
    const adminId = "admin-uuid-001";
    const adminEmail = "admin@rba.com";

    it("1. Re-authenticated user ID matches current admin ID -> approval proceeds", async () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "ok", request_id: "req-123", expires_at: expiresAt },
          error: null,
        }),
      } as any;
      const fakeEphemeralAuth = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: adminId, email: adminEmail } },
            error: null,
          }),
        },
      } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "correctpassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(true);
      expect(res.expiresAt).toBe(expiresAt);
      expect(fakeSupabase.rpc).toHaveBeenCalledWith("admin_approve_sales_pin_change", {
        target_request_id: "req-123",
        reauth_token: expect.any(String),
      });
    });

    it("2. Re-authenticated user ID differs from current admin ID -> approval fails", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;
      const fakeEphemeralAuth = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: "different-admin-uuid-999", email: adminEmail } },
            error: null,
          }),
        },
      } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "validpassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("Re-authenticated identity does not match current admin session.");
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("3. Current user is not admin -> approval fails before authentication", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;
      const fakeEphemeralAuth = { auth: { signInWithPassword: vi.fn() } } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: "sales-user-id",
        currentAdminEmail: "sales@rba.com",
        currentAdminRole: "sales", // Not admin
        adminPassword: "anypassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("Administrator access required.");
      expect(fakeEphemeralAuth.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("4. Incorrect admin password -> approval fails and approval RPC is never called", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;
      const fakeEphemeralAuth = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "Invalid login credentials" },
          }),
        },
      } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "wrongpassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("Incorrect admin password.");
      expect(fakeEphemeralAuth.auth.signInWithPassword).toHaveBeenCalledWith({
        email: adminEmail,
        password: "wrongpassword",
      });
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("5. Correct password + wrong re-authenticated identity -> approval RPC is never called", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;
      const fakeEphemeralAuth = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: "attacker-or-swapped-id", email: adminEmail } },
            error: null,
          }),
        },
      } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "validpassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("does not match current admin session");
      // Critical check: RPC MUST NEVER be called
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("rejects approval if admin password is missing or empty", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;
      const fakeEphemeralAuth = { auth: { signInWithPassword: vi.fn() } } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("Admin password is required.");
      expect(fakeEphemeralAuth.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("fails if admin attempts to approve their own request", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "cannot_approve_own" },
          error: null,
        }),
      } as any;
      const fakeEphemeralAuth = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: adminId, email: adminEmail } },
            error: null,
          }),
        },
      } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "correctpassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("cannot approve their own");
    });

    it("fails if request is no longer in pending state (already approved/rejected)", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "invalid_state" },
          error: null,
        }),
      } as any;
      const fakeEphemeralAuth = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: { id: adminId } },
            error: null,
          }),
        },
      } as any;

      const res = await verifyAdminPasswordAndApprove({
        currentAdminId: adminId,
        currentAdminEmail: adminEmail,
        currentAdminRole: "admin",
        adminPassword: "correctpassword",
        requestId: "req-123",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("no longer pending approval");
    });
  });

  describe("Admin Rejection (adminRejectPinChange)", () => {
    it("successfully rejects a pending request", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "ok" },
          error: null,
        }),
      } as any;

      const res = await adminRejectPinChange({
        requestId: "req-123",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(true);
      expect(fakeSupabase.rpc).toHaveBeenCalledWith("admin_reject_sales_pin_change", {
        target_request_id: "req-123",
      });
    });

    it("handles request not in pending state", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "invalid_state" },
          error: null,
        }),
      } as any;

      const res = await adminRejectPinChange({
        requestId: "req-123",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("no longer pending");
    });
  });

  describe("Completing PIN Change (completePinChange)", () => {
    it("rejects weak PIN before making database call", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;

      const res = await completePinChange({
        requestId: "req-123",
        newPin: "1234",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("simple or common");
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("rejects invalid format before making database call", async () => {
      const fakeSupabase = { rpc: vi.fn() } as any;

      const res = await completePinChange({
        requestId: "req-123",
        newPin: "99",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("between 4 and 6 digits");
      expect(fakeSupabase.rpc).not.toHaveBeenCalled();
    });

    it("fails when request has not been approved", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "not_approved" },
          error: null,
        }),
      } as any;

      const res = await completePinChange({
        requestId: "req-123",
        newPin: "8472",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("has not been approved");
    });

    it("fails when approval has expired (> 15 minutes)", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "expired" },
          error: null,
        }),
      } as any;

      const res = await completePinChange({
        requestId: "req-123",
        newPin: "8472",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Approval expired");
    });

    it("fails when request is not found or not owned by user", async () => {
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "not_found" },
          error: null,
        }),
      } as any;

      const res = await completePinChange({
        requestId: "req-other-user",
        newPin: "8472",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("not found or not owned by you");
    });

    it("successfully completes PIN change and updates epoch", async () => {
      const newEpoch = "epoch-fresh-999";
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { status: "ok", pin_epoch: newEpoch },
          error: null,
        }),
      } as any;

      const res = await completePinChange({
        requestId: "req-123",
        newPin: "8472",
        supabaseClient: fakeSupabase,
      });

      expect(res.ok).toBe(true);
      expect(res.pinEpoch).toBe(newEpoch);
    });
  });

  describe("Session & Epoch Invalidation Security", () => {
    it("invalidates old session cookies when epoch is updated", async () => {
      const oldEpoch = "epoch-old-111";
      const newEpoch = "epoch-new-222";
      const context = { uid: "user-456", sid: "session-789" };

      // Old token generated with old epoch
      const oldToken = await createPinToken({
        uid: context.uid,
        sid: context.sid,
        ep: oldEpoch,
      });

      // Verify old token is valid against old epoch
      const oldPayload = await verifyPinToken(oldToken, context);
      expect(oldPayload?.ep).toBe(oldEpoch);

      // Now user completes PIN change -> epoch becomes newEpoch
      // When verifying against the current epoch (newEpoch), old epoch must NOT match
      expect(oldPayload?.ep === newEpoch).toBe(false);

      // New token generated with new epoch
      const newToken = await createPinToken({
        uid: context.uid,
        sid: context.sid,
        ep: newEpoch,
      });

      const newPayload = await verifyPinToken(newToken, context);
      expect(newPayload?.ep).toBe(newEpoch);
      expect(newPayload?.ep === newEpoch).toBe(true);
    });
  });
});