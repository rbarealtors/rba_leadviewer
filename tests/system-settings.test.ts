import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getMaxBrowserPdfSourceMb,
  updateMaxBrowserPdfSourceMb,
  validatePdfSourceLimit,
  PDF_SOURCE_LIMIT_BOUNDS,
  SYSTEM_SETTING_KEYS,
} from "@/lib/settings/system-settings";
import {
  optimizePdfClient,
  DEFAULT_CLIENT_OPTIMIZE_SOURCE_MB,
} from "@/lib/brochures/client-optimize";
import {
  validatePdfBytes,
  MAX_BROCHURE_FILE_SIZE_BYTES,
  formatFileSize,
} from "@/lib/brochures/validate";
import { isAdmin, isStaffOrAdmin, getAppRole } from "@/lib/auth/authorization";

describe("System Settings: Maximum PDF Source Size Configuration", () => {
  describe("1. Default & Persistence Values", () => {
    it("defaults to 150 MB when no database row exists or query returns null", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any;

      const limit = await getMaxBrowserPdfSourceMb(mockSupabase);
      expect(limit).toBe(150);
      expect(limit).toBe(DEFAULT_CLIENT_OPTIMIZE_SOURCE_MB);
      expect(limit).toBe(PDF_SOURCE_LIMIT_BOUNDS.DEFAULT_MB);
    });

    it("falls back to default 150 MB gracefully when database table does not exist or errors", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "42P01", message: "relation public.system_settings does not exist" },
              }),
            }),
          }),
        }),
      } as any;

      const limit = await getMaxBrowserPdfSourceMb(mockSupabase);
      expect(limit).toBe(150);
    });

    it("reads persisted configured value from system_settings", async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { value: 200 },
                error: null,
              }),
            }),
          }),
        }),
      } as any;

      const limit = await getMaxBrowserPdfSourceMb(mockSupabase);
      expect(limit).toBe(200);
    });
  });

  describe("2. Validation & Bounds (Min 25 MB, Max 250 MB)", () => {
    it("accepts valid integers within [25, 250]", () => {
      expect(validatePdfSourceLimit(25).valid).toBe(true);
      expect(validatePdfSourceLimit(100).valid).toBe(true);
      expect(validatePdfSourceLimit(150).valid).toBe(true);
      expect(validatePdfSourceLimit(250).valid).toBe(true);
    });

    it("rejects values below 25 MB to prevent conflicting with the 25 MB storage ceiling", () => {
      const result = validatePdfSourceLimit(20);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cannot be less than 25 MB/i);
    });

    it("rejects values above 250 MB to safeguard browser memory", () => {
      const result = validatePdfSourceLimit(300);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cannot exceed 250 MB/i);
    });

    it("rejects non-integer, NaN, or invalid inputs", () => {
      expect(validatePdfSourceLimit("abc").valid).toBe(false);
      expect(validatePdfSourceLimit(null).valid).toBe(false);
      expect(validatePdfSourceLimit(100.5).valid).toBe(false);
    });
  });

  describe("3. Role-Based Authorization Enforcement", () => {
    it("allows only admin users to modify system settings", () => {
      const adminUser = { app_metadata: { role: "admin" } };
      const staffUser = { app_metadata: { role: "staff" } };
      const salesUser = { app_metadata: { role: "sales" } };

      expect(isAdmin(adminUser)).toBe(true);
      expect(isAdmin(staffUser)).toBe(false);
      expect(isAdmin(salesUser)).toBe(false);
    });

    it("allows Admin to update the setting via updateMaxBrowserPdfSourceMb", async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockAdminClient = {
        from: vi.fn().mockReturnValue({
          upsert: mockUpsert,
        }),
      } as any;

      const result = await updateMaxBrowserPdfSourceMb(180, mockAdminClient, "admin-user-id");
      expect(result.success).toBe(true);
      expect(result.value).toBe(180);
      expect(mockAdminClient.from).toHaveBeenCalledWith("system_settings");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          key: SYSTEM_SETTING_KEYS.MAX_BROWSER_PDF_SOURCE_MB,
          value: 180,
          updated_by: "admin-user-id",
        }),
        { onConflict: "key" },
      );
    });

    it("throws error when attempting to update with an invalid value", async () => {
      const mockAdminClient = { from: vi.fn() } as any;
      await expect(
        updateMaxBrowserPdfSourceMb(10, mockAdminClient, "admin-user-id"),
      ).rejects.toThrow(/cannot be less than 25 MB/i);
      expect(mockAdminClient.from).not.toHaveBeenCalled();
    });
  });

  describe("4. Client Optimization Ingestion & Bounded Memory Behavior", () => {
    it("bypasses browser optimization for PDF <= 25 MB", async () => {
      const content = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
      const file = new File([content], "floor-plan.pdf", { type: "application/pdf" });

      const result = await optimizePdfClient(file, undefined, 150 * 1024 * 1024);
      expect(result.success).toBe(true);
      expect(result.file).toBe(file);
      expect(result.reductionPercent).toBe(0);
    });

    it("rejects files exceeding configured limit BEFORE arrayBuffer() is called", async () => {
      const configuredLimitMb = 150;
      const configuredLimitBytes = configuredLimitMb * 1024 * 1024;

      const mockArrayBuffer = vi.fn();
      const oversizedFile = {
        name: "massive-brochure.pdf",
        size: 160 * 1024 * 1024, // 160 MB > 150 MB
        arrayBuffer: mockArrayBuffer,
      } as unknown as File;

      const result = await optimizePdfClient(oversizedFile, undefined, configuredLimitBytes);
      expect(result.success).toBe(false);
      expect(mockArrayBuffer).not.toHaveBeenCalled(); // Memory safety verified!
      expect(result.error).toMatch(/160\.0 MB, which is too large for browser processing/i);
      expect(result.error).toMatch(/under 150\.0 MB/i);
    });

    it("changing the configured setting dynamically changes client admission behavior", async () => {
      const mockArrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(100));
      const testFile = {
        name: "test-brochure.pdf",
        size: 120 * 1024 * 1024, // 120 MB
        arrayBuffer: mockArrayBuffer,
      } as unknown as File;

      // Scenario A: When Admin configured limit is 100 MB -> 120 MB is rejected
      const limit100Bytes = 100 * 1024 * 1024;
      const resultA = await optimizePdfClient(testFile, undefined, limit100Bytes);
      expect(resultA.success).toBe(false);
      expect(resultA.error).toMatch(/under 100\.0 MB/i);
      expect(mockArrayBuffer).not.toHaveBeenCalled();

      // Scenario B: When Admin increases setting to 150 MB -> 120 MB passes source check
      const limit150Bytes = 150 * 1024 * 1024;
      const optimizeModule = await import("@/lib/brochures/optimize");
      const spy = vi.spyOn(optimizeModule, "optimizePdf").mockResolvedValueOnce({
        optimizedBytes: new Uint8Array(18 * 1024 * 1024),
        originalSizeBytes: 120 * 1024 * 1024,
        optimizedSizeBytes: 18 * 1024 * 1024,
        imagesOptimized: 10,
      });

      const resultB = await optimizePdfClient(testFile, undefined, limit150Bytes);
      expect(resultB.success).toBe(true);
      expect(mockArrayBuffer).toHaveBeenCalled();
      expect(resultB.optimizedSizeBytes).toBe(18 * 1024 * 1024);
      spy.mockRestore();
    });
  });

  describe("5. Storage Security Ceiling (25 MB) Invariance", () => {
    it("keeps server 25 MB limit strictly enforced even if browser limit is raised to 250 MB", () => {
      // Regardless of client source limit (e.g. 250 MB), server validatePdfBytes MUST reject files > 25 MB
      const oversizedBytes = new Uint8Array(26 * 1024 * 1024);
      oversizedBytes[0] = 0x25;
      oversizedBytes[1] = 0x50;
      oversizedBytes[2] = 0x44;
      oversizedBytes[3] = 0x46;
      oversizedBytes[4] = 0x2d;

      const serverValidation = validatePdfBytes(oversizedBytes);
      expect(serverValidation.valid).toBe(false);
      expect(serverValidation.error).toMatch(/exceeds the maximum allowed limit of 25 MB/i);
    });

    it("ensures compression failure (> 25 MB output) remains distinct from source size rejection", async () => {
      const mockFile = {
        name: "unreducible.pdf",
        size: 50 * 1024 * 1024, // Within source limit
        arrayBuffer: async () => new ArrayBuffer(50),
      } as unknown as File;

      const optimizeModule = await import("@/lib/brochures/optimize");
      const spy = vi.spyOn(optimizeModule, "optimizePdf").mockResolvedValueOnce({
        optimizedBytes: new Uint8Array(27 * 1024 * 1024),
        originalSizeBytes: 50 * 1024 * 1024,
        optimizedSizeBytes: 27 * 1024 * 1024, // Fails 25 MB target
        imagesOptimized: 5,
      });

      const result = await optimizePdfClient(mockFile, undefined, 150 * 1024 * 1024);
      expect(result.success).toBe(false);
      expect(result.error).toBe("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
      spy.mockRestore();
    });
  });
});
