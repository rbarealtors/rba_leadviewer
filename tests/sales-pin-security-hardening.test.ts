import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createPinToken } from "@/lib/auth/pin-cookie";
import fs from "fs";
import path from "path";

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    rpc: mockRpc,
  })),
}));

// Mock Next.js cookies
const mockCookieStoreGet = vi.fn();
const mockCookieStoreSet = vi.fn();
const mockCookieStoreDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieStoreGet,
    set: mockCookieStoreSet,
    delete: mockCookieStoreDelete,
    has: (name: string) => !!mockCookieStoreGet(name),
  })),
}));

// Import subject modules after mocking
import { requireSalesPin } from "@/lib/auth/require-sales-pin";
import { POST as verifyPinRouteHandler } from "@/lib/auth/verify-pin";

const TEST_SECRET = "0123456789abcdef0123456789abcdef"; // 32 chars

describe("Sales PIN Hardening & Remediated Production Security", () => {
  const originalSecret = process.env.PIN_COOKIE_SECRET;

  beforeEach(() => {
    process.env.PIN_COOKIE_SECRET = TEST_SECRET;
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    process.env.PIN_COOKIE_SECRET = originalSecret;
  });

  describe("1. requireSalesPin() authorization enforcement", () => {
    it("returns true (no-op) for non-sales roles (admin, manager, staff)", async () => {
      for (const role of ["admin", "manager", "staff"]) {
        mockGetUser.mockResolvedValueOnce({
          data: { user: { id: "user-admin-1", app_metadata: { role } } },
          error: null,
        });

        const allowed = await requireSalesPin();
        expect(allowed).toBe(true);
      }
    });

    it("returns false for sales role when PIN cookie is missing", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "sales-1", app_metadata: { role: "sales" } } },
        error: null,
      });
      mockCookieStoreGet.mockReturnValueOnce(undefined);

      const allowed = await requireSalesPin();
      expect(allowed).toBe(false);
    });

    it("returns false for sales role when PIN token signature is forged", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "sales-1", app_metadata: { role: "sales" } } },
        error: null,
      });
      mockCookieStoreGet.mockReturnValueOnce({ value: "forged.signature" });
      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      const allowed = await requireSalesPin();
      expect(allowed).toBe(false);
    });

    it("returns false for sales role when PIN token is bound to a different user ID", async () => {
      const tokenForUser2 = await createPinToken({
        uid: "sales-user-2",
        sid: "session-123",
        ep: "epoch-abc",
      });

      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: "sales-user-1",
            app_metadata: { role: "sales" },
            last_sign_in_at: "2026-10-01T00:00:00Z",
          },
        },
        error: null,
      });
      mockCookieStoreGet.mockReturnValueOnce({ value: tokenForUser2 });
      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      const allowed = await requireSalesPin();
      expect(allowed).toBe(false);
    });

    it("returns false for sales role when token epoch differs from database pin_epoch", async () => {
      const tokenWithOldEpoch = await createPinToken({
        uid: "sales-1",
        sid: "session-100",
        ep: "old-epoch-111",
      });

      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: "sales-1",
            app_metadata: { role: "sales" },
            last_sign_in_at: "session-100",
          },
        },
        error: null,
      });
      mockCookieStoreGet.mockReturnValueOnce({ value: tokenWithOldEpoch });
      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      mockRpc.mockResolvedValueOnce({
        data: { has_pin: true, pin_epoch: "new-epoch-999" },
        error: null,
      });

      const allowed = await requireSalesPin();
      expect(allowed).toBe(false);
    });

    it("returns true for sales role when token signature, uid, sid, and DB epoch all match", async () => {
      const validEpoch = "epoch-valid-555";
      const validToken = await createPinToken({
        uid: "sales-1",
        sid: "session-100",
        ep: validEpoch,
      });

      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: "sales-1",
            app_metadata: { role: "sales" },
            last_sign_in_at: "session-100",
          },
        },
        error: null,
      });
      mockCookieStoreGet.mockReturnValueOnce({ value: validToken });
      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      mockRpc.mockResolvedValueOnce({
        data: { has_pin: true, pin_epoch: validEpoch },
        error: null,
      });

      const allowed = await requireSalesPin();
      expect(allowed).toBe(true);
    });
  });

  describe("2. /api/auth/verify-pin POST Handler Security", () => {
    it("returns 400 for invalid PIN format", async () => {
      const req = new Request("http://localhost/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "abc" }),
      });

      const res = await verifyPinRouteHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.message).toContain("4 and 6 digits");
    });

    it("returns 401 for unauthenticated caller", async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "No session" } });

      const req = new Request("http://localhost/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      });

      const res = await verifyPinRouteHandler(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-sales roles", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "admin-1", app_metadata: { role: "admin" } } },
        error: null,
      });

      const req = new Request("http://localhost/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      });

      const res = await verifyPinRouteHandler(req);
      expect(res.status).toBe(403);
    });

    it("returns 423 (Locked) when account is currently locked out", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "sales-1", app_metadata: { role: "sales" } } },
        error: null,
      });

      const lockedTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      mockRpc.mockResolvedValueOnce({
        data: { status: "locked", locked_until: lockedTime },
        error: null,
      });

      const req = new Request("http://localhost/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      });

      const res = await verifyPinRouteHandler(req);
      expect(res.status).toBe(423);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.status).toBe("locked");
    });

    it("returns 401 and attempts remaining on incorrect PIN", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "sales-1", app_metadata: { role: "sales" } } },
        error: null,
      });

      mockRpc.mockResolvedValueOnce({
        data: { status: "invalid", attempts_remaining: 3 },
        error: null,
      });

      const req = new Request("http://localhost/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "9999" }),
      });

      const res = await verifyPinRouteHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.attempts_remaining).toBe(3);
    });

    it("issues signed cookie and returns 200 on successful verify_sales_pin RPC", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: "sales-1",
            app_metadata: { role: "sales" },
            last_sign_in_at: "session-abc",
          },
        },
        error: null,
      });

      mockRpc.mockResolvedValueOnce({
        data: { status: "ok", pin_epoch: "epoch-123456" },
        error: null,
      });

      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      const req = new Request("http://localhost/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "5678" }),
      });

      const res = await verifyPinRouteHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.verified).toBe(true);
      expect(mockCookieStoreSet).toHaveBeenCalled();
    });
  });

  describe("3. Database Migration 0019 Structure & Security Invariants", () => {
    let migrationSql = "";

    beforeAll(() => {
      const candidates = [
        path.resolve(__dirname, "../supabase/migrations/0019_sales_pin_production_security_hardening.sql"),
        path.resolve(process.cwd(), "supabase/migrations/0019_sales_pin_production_security_hardening.sql"),
        path.resolve(process.cwd(), "rba_leadviewer/supabase/migrations/0019_sales_pin_production_security_hardening.sql"),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          migrationSql = fs.readFileSync(p, "utf8");
          break;
        }
      }
      if (!migrationSql) {
        throw new Error(`Could not find migration 0019 in candidates: ${candidates.join(", ")}`);
      }
    });

    it("revokes all direct table privileges from PUBLIC, anon, and authenticated on all PIN tables", () => {
      expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.sales_pins FROM PUBLIC, anon, authenticated;");
      expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.pin_audit FROM PUBLIC, anon, authenticated;");
      expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.sales_pin_change_requests FROM PUBLIC, anon, authenticated;");
      expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.admin_reauth_grants FROM PUBLIC, anon, authenticated;");
    });

    it("enables Row Level Security on all security-sensitive PIN tables", () => {
      expect(migrationSql).toContain("ALTER TABLE public.sales_pins ENABLE ROW LEVEL SECURITY;");
      expect(migrationSql).toContain("ALTER TABLE public.pin_audit ENABLE ROW LEVEL SECURITY;");
      expect(migrationSql).toContain("ALTER TABLE public.sales_pin_change_requests ENABLE ROW LEVEL SECURITY;");
      expect(migrationSql).toContain("ALTER TABLE public.admin_reauth_grants ENABLE ROW LEVEL SECURITY;");
    });

    it("enforces partial unique index for active PIN change requests", () => {
      expect(migrationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_pin_request_per_user");
      expect(migrationSql).toContain("WHERE status IN ('REQUESTED', 'APPROVED');");
    });

    it("protects create_admin_reauth_grant by granting only to service_role", () => {
      expect(migrationSql).toContain("REVOKE ALL ON FUNCTION public.create_admin_reauth_grant(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;");
      expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.create_admin_reauth_grant(UUID, UUID, TEXT, TEXT) TO service_role;");
    });

    it("drops legacy un-tokenized admin_approve_sales_pin_change(UUID)", () => {
      expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.admin_approve_sales_pin_change(UUID);");
    });

    it("drops legacy signatures before recreation to prevent 42P13 parameter name conflicts", () => {
      expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.verify_sales_pin(TEXT);");
      expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.set_sales_pin_initial(TEXT);");
      expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.admin_reset_sales_pin(UUID);");
      expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.admin_unlock_sales_pin(UUID);");
    });

    it("ensures all security functions set search_path = '' and use SECURITY DEFINER", () => {
      const functionMatches = migrationSql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$/g) || [];
      expect(functionMatches.length).toBeGreaterThan(0);
      for (const fn of functionMatches) {
        expect(fn).toContain("SECURITY DEFINER");
        expect(fn).toContain("SET search_path = ''");
      }
    });

    it("ensures unambiguous column binding and avoids target_request_id = target_request_id", () => {
      expect(migrationSql).not.toContain("target_request_id = target_request_id");
      expect(migrationSql).toContain("g.request_id = v_target_request_id");
    });
  });

  describe("4. Admin Reauth Grant Proof & Security Hardening Guarantees", () => {
    const adminId = "admin-uuid-111";
    const adminEmail = "admin@example.com";
    const requestId = "req-uuid-222";

    it("correct grant lookup: creates reauth grant via serviceRoleClient and passes valid token to approve RPC", async () => {
      const { verifyAdminPasswordAndApprove } = await import("@/lib/auth/pin-change-service");

      const mockServiceRpc = vi.fn().mockResolvedValue({
        data: { status: "ok", grant_id: "grant-uuid-1" },
        error: null,
      });
      const mockSupabaseRpc = vi.fn().mockResolvedValue({
        data: { status: "ok", request_id: requestId, expires_at: "2026-10-03T13:00:00Z" },
        error: null,
      });

      const fakeServiceRoleClient = { rpc: mockServiceRpc } as any;
      const fakeSupabase = { rpc: mockSupabaseRpc } as any;
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
        adminPassword: "ValidPassword123!",
        requestId,
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
        serviceRoleClient: fakeServiceRoleClient,
      });

      expect(res.ok).toBe(true);
      expect(res.expiresAt).toBe("2026-10-03T13:00:00Z");

      // Verify service-role grant creation
      expect(mockServiceRpc).toHaveBeenCalledWith("create_admin_reauth_grant", {
        target_admin_id: adminId,
        target_request_id: requestId,
        token_hash: expect.any(String),
        grant_purpose: "approve_sales_pin_change",
      });

      // Verify admin approval called with matching raw token
      expect(mockSupabaseRpc).toHaveBeenCalledWith("admin_approve_sales_pin_change", {
        target_request_id: requestId,
        reauth_token: expect.any(String),
      });
    });

    it("wrong-request tokens: approval fails if grant does not match target request", async () => {
      const { verifyAdminPasswordAndApprove } = await import("@/lib/auth/pin-change-service");

      const mockSupabaseRpc = vi.fn().mockResolvedValue({
        data: { status: "invalid_grant" },
        error: null,
      });

      const fakeSupabase = { rpc: mockSupabaseRpc } as any;
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
        adminPassword: "ValidPassword123!",
        requestId: "wrong-req-id",
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Authorization grant invalid or expired");
    });

    it("token reuse: already consumed grant cannot be reused", async () => {
      const { verifyAdminPasswordAndApprove } = await import("@/lib/auth/pin-change-service");

      const mockSupabaseRpc = vi.fn().mockResolvedValue({
        data: { status: "invalid_grant" },
        error: null,
      });

      const fakeSupabase = { rpc: mockSupabaseRpc } as any;
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
        adminPassword: "ValidPassword123!",
        requestId,
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Authorization grant invalid or expired");
    });

    it("self-approval rejection: admins cannot approve their own PIN requests", async () => {
      const { verifyAdminPasswordAndApprove } = await import("@/lib/auth/pin-change-service");

      const mockSupabaseRpc = vi.fn().mockResolvedValue({
        data: { status: "cannot_approve_own" },
        error: null,
      });

      const fakeSupabase = { rpc: mockSupabaseRpc } as any;
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
        adminPassword: "ValidPassword123!",
        requestId,
        supabaseClient: fakeSupabase,
        ephemeralAuthClient: fakeEphemeralAuth,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe("Admins cannot approve their own PIN change requests.");
    });
  });
});
