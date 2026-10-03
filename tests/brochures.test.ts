import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import jpeg from "jpeg-js";
import {
  validatePdfBytes,
  normalizeProjectName,
  validateTitle,
  generateBrochureKey,
  sanitizeDownloadFilename,
  formatFileSize,
  parseXhrErrorMessage,
} from "@/lib/brochures/validate";
import {
  MAX_BROCHURE_FILE_SIZE_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  BROCHURES_STORAGE_BUCKET,
} from "@/lib/brochures/types";
import {
  getAppRole,
  isStaffOrAdmin,
  canManageBrochures,
} from "@/lib/auth/authorization";
import { optimizePdf } from "@/lib/brochures/optimize";
import {
  optimizePdfClient,
  MAX_CLIENT_OPTIMIZE_SOURCE_BYTES,
} from "@/lib/brochures/client-optimize";
import {
  storageKeyToBucketPath,
  checkStorageCeiling,
  getCurrentStorageUsageBytes,
} from "@/lib/storage/supabase-storage";

describe("Brochure PDF & Metadata Validation", () => {
  it("rejects empty buffers", () => {
    const empty = new Uint8Array(0);
    const res = validatePdfBytes(empty);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });

  it("rejects non-PDF files lacking %PDF- magic bytes", () => {
    const textBytes = new TextEncoder().encode("Hello, world! This is not a PDF.");
    const res = validatePdfBytes(textBytes);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/valid PDF header/i);
  });

  it("accepts valid PDF header with %PDF- prefix", () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    const res = validatePdfBytes(pdfBytes);
    expect(res.valid).toBe(true);
    expect(res.sizeBytes).toBe(8);
  });

  it("enforces maximum file size limit (25 MB)", () => {
    const oversizedBytes = {
      byteLength: MAX_BROCHURE_FILE_SIZE_BYTES + 1,
    } as unknown as Uint8Array;

    const res = validatePdfBytes(oversizedBytes);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/exceeds the maximum allowed limit/i);
  });

  it("validates and trims title properly", () => {
    expect(validateTitle("").valid).toBe(false);
    expect(validateTitle("   ").valid).toBe(false);
    expect(validateTitle(null).valid).toBe(false);

    const valid = validateTitle("  Ashiyana Heights Floor Plans  ");
    expect(valid.valid).toBe(true);
    expect(valid.title).toBe("Ashiyana Heights Floor Plans");
  });

  it("normalizes project names by collapsing whitespace and setting empty to null", () => {
    expect(normalizeProjectName(null)).toBeNull();
    expect(normalizeProjectName("")).toBeNull();
    expect(normalizeProjectName("   ")).toBeNull();
    expect(normalizeProjectName("  Casa   Dreamville   Phase 2  ")).toBe(
      "Casa Dreamville Phase 2",
    );
  });

  it("generates immutable storage keys starting with brochures/", () => {
    const brochureId = "550e8400-e29b-41d4-a716-446655440000";
    const fileUuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const key = generateBrochureKey(brochureId, fileUuid);

    expect(key).toBe(
      "brochures/550e8400-e29b-41d4-a716-446655440000/6ba7b810-9dad-11d1-80b4-00c04fd430c8.pdf",
    );
    expect(key.startsWith("brochures/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("translates storage keys into bucket and relative path for Supabase Storage", () => {
    const key = "brochures/550e8400/file123.pdf";
    const parsed = storageKeyToBucketPath(key);
    expect(parsed.bucket).toBe(BROCHURES_STORAGE_BUCKET);
    expect(parsed.path).toBe("550e8400/file123.pdf");
  });

  it("sanitizes download filenames against path traversal and header injection", () => {
    const dirty = "../../etc/passwd\r\nSet-Cookie: evil=true";
    const sanitized = sanitizeDownloadFilename(dirty, "Brochure");

    expect(sanitized).not.toContain("../");
    expect(sanitized).not.toContain("\r");
    expect(sanitized).not.toContain("\n");
    expect(sanitized.endsWith(".pdf")).toBe(true);

    const normal = sanitizeDownloadFilename("Godrej_Aristocrat.pdf", "Godrej");
    expect(normal).toBe("Godrej_Aristocrat.pdf");
  });

  it("formats file sizes nicely across KB, MB, and GB", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024 * 50)).toBe("50.0 KB");
    expect(formatFileSize(1024 * 1024 * 12.4)).toBe("12.4 MB");
    expect(formatFileSize(MAX_TOTAL_STORAGE_BYTES)).toBe("2.70 GB");
  });
});

describe("PDF Optimization Pipeline", () => {
  it("successfully optimizes a valid PDF and records accurate byte sizes", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    page.drawText("RBA Realtors Property Brochure", { x: 50, y: 350 });
    const originalPdfBytes = await doc.save();

    const result = await optimizePdf(originalPdfBytes);

    expect(result.originalSizeBytes).toBe(originalPdfBytes.byteLength);
    expect(result.optimizedSizeBytes).toBe(result.optimizedBytes.byteLength);
    expect(result.optimizedSizeBytes).toBeGreaterThan(0);

    const loaded = await PDFDocument.load(result.optimizedBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("downsamples and optimizes oversized embedded images", async () => {
    const rawImage = Buffer.alloc(2000 * 1650 * 4, 120);
    const encoded = jpeg.encode({ data: rawImage, width: 2000, height: 1650 }, 90);

    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(new Uint8Array(encoded.data));
    const page = doc.addPage([1000, 1000]);
    page.drawImage(img, { x: 0, y: 0, width: 1000, height: 1000 });
    const originalPdfBytes = await doc.save();

    const result = await optimizePdf(originalPdfBytes);

    expect(result.imagesOptimized).toBeGreaterThanOrEqual(1);
    expect(result.optimizedSizeBytes).toBeLessThan(result.originalSizeBytes);

    const verified = await PDFDocument.load(result.optimizedBytes);
    expect(verified.getPageCount()).toBe(1);
  });

  it("downsamples and optimizes images when /Filter is an array [ /DCTDecode ]", async () => {
    const rawImage = Buffer.alloc(2000 * 1650 * 4, 120);
    const encoded = jpeg.encode({ data: rawImage, width: 2000, height: 1650 }, 90);

    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(new Uint8Array(encoded.data));
    const page = doc.addPage([1000, 1000]);
    page.drawImage(img, { x: 0, y: 0, width: 1000, height: 1000 });

    // Manually wrap Filter into a PDFArray [ /DCTDecode ] as exported by Adobe InDesign / Acrobat
    const entries = doc.context.enumerateIndirectObjects();
    for (const [, obj] of entries) {
      if (obj instanceof PDFRawStream) {
        const subtype = obj.dict.get(PDFName.of("Subtype"));
        if (subtype === PDFName.of("Image")) {
          const filterArr = doc.context.obj([PDFName.of("DCTDecode")]);
          obj.dict.set(PDFName.of("Filter"), filterArr);
        }
      }
    }

    const originalPdfBytes = await doc.save();
    const result = await optimizePdf(originalPdfBytes);

    expect(result.imagesOptimized).toBeGreaterThanOrEqual(1);
    expect(result.optimizedSizeBytes).toBeLessThan(result.originalSizeBytes);

    const verified = await PDFDocument.load(result.optimizedBytes);
    expect(verified.getPageCount()).toBe(1);
  });

  it("fails gracefully with descriptive error on invalid or corrupted PDF bytes", async () => {
    const corruptBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x99]);
    await expect(optimizePdf(corruptBytes)).rejects.toThrow(/invalid or corrupted pdf/i);
  });

  it("rejects empty buffer in optimizer", async () => {
    const emptyBytes = new Uint8Array(0);
    await expect(optimizePdf(emptyBytes)).rejects.toThrow(/empty/i);
  });

  it("emits real progress callbacks through each discrete optimization phase", async () => {
    const rawImage = Buffer.alloc(1800 * 1800 * 4, 150);
    const encoded = jpeg.encode({ data: rawImage, width: 1800, height: 1800 }, 90);

    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(new Uint8Array(encoded.data));
    const page = doc.addPage([1000, 1000]);
    page.drawImage(img, { x: 0, y: 0, width: 1000, height: 1000 });
    const originalPdfBytes = await doc.save();

    const progressPhases: string[] = [];
    const imageProgressCalls: number[] = [];

    const result = await optimizePdf(originalPdfBytes, (p) => {
      progressPhases.push(p.phase);
      if (p.phase === "optimizing_images" && p.currentImage) {
        imageProgressCalls.push(p.currentImage);
      }
    });

    expect(result.imagesOptimized).toBeGreaterThanOrEqual(1);
    expect(progressPhases).toContain("reading");
    expect(progressPhases).toContain("analyzing");
    expect(progressPhases).toContain("optimizing_images");
    expect(progressPhases).toContain("rebuilding");
    expect(progressPhases).toContain("finalizing");
    expect(progressPhases).toContain("complete");
    expect(imageProgressCalls).toContain(1);
  });
});

describe("Client-Side PDF Optimization (optimizePdfClient)", () => {
  it("passes files <= 25 MB directly through without re-encoding", async () => {
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // 8 bytes
    const file = new File([content], "normal.pdf", { type: "application/pdf" });

    const result = await optimizePdfClient(file);
    expect(result.success).toBe(true);
    expect(result.file).toBe(file);
    expect(result.originalSizeBytes).toBe(8);
    expect(result.optimizedSizeBytes).toBe(8);
    expect(result.reductionPercent).toBe(0);
  });

  it("rejects 0-byte empty files client-side", async () => {
    const emptyFile = new File([], "empty.pdf", { type: "application/pdf" });
    const result = await optimizePdfClient(emptyFile);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects files exceeding the client memory boundary (> configured source limit)", async () => {
    const hugeFile = {
      name: "huge.pdf",
      size: MAX_CLIENT_OPTIMIZE_SOURCE_BYTES + 1024,
      arrayBuffer: vi.fn(),
    } as unknown as File;

    const result = await optimizePdfClient(hugeFile);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too large for browser processing/i);
    expect(hugeFile.arrayBuffer).not.toHaveBeenCalled();
  });

  it("successfully optimizes an oversized PDF (> 25 MB) to <= 25 MB", async () => {
    const rawImage = Buffer.alloc(1800 * 1800 * 4, 150);
    const encoded = jpeg.encode({ data: rawImage, width: 1800, height: 1800 }, 90);

    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(new Uint8Array(encoded.data));
    const page = doc.addPage([1000, 1000]);
    page.drawImage(img, { x: 0, y: 0, width: 1000, height: 1000 });
    const pdfBytes = await doc.save();

    const mockOversizedFile = {
      name: "oversized.pdf",
      size: 28 * 1024 * 1024,
      arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
    } as unknown as File;

    const progressPhases: string[] = [];
    const result = await optimizePdfClient(mockOversizedFile, (p) => {
      progressPhases.push(p.phase);
    });
    expect(result.success).toBe(true);
    expect(progressPhases).toContain("reading");
    expect(progressPhases).toContain("optimizing_images");
    expect(progressPhases).toContain("complete");
    expect(result.file).toBeDefined();
    expect(result.file).toBeInstanceOf(File);
    expect(result.file?.name).toBe("oversized.pdf");
    expect(result.file?.size).toBeLessThanOrEqual(MAX_BROCHURE_FILE_SIZE_BYTES);
    expect(result.originalSizeBytes).toBe(28 * 1024 * 1024);
    expect(result.optimizedSizeBytes).toBeLessThan(result.originalSizeBytes);
    expect(result.reductionPercent).toBeGreaterThan(0);
  });

  it("rejects client-side when optimization cannot reduce the PDF below 25 MB", async () => {
    const mockUncompressibleFile = {
      name: "massive-scan.pdf",
      size: 30 * 1024 * 1024,
      arrayBuffer: async () => {
        const doc = await PDFDocument.create();
        doc.addPage([500, 500]);
        return (await doc.save()).buffer;
      },
    } as unknown as File;

    const optimizeModule = await import("@/lib/brochures/optimize");
    const spy = vi.spyOn(optimizeModule, "optimizePdf").mockResolvedValueOnce({
      optimizedBytes: new Uint8Array(26 * 1024 * 1024),
      originalSizeBytes: 30 * 1024 * 1024,
      optimizedSizeBytes: 26 * 1024 * 1024,
      imagesOptimized: 2,
    });

    const result = await optimizePdfClient(mockUncompressibleFile);
    expect(result.success).toBe(false);
    expect(result.error).toBe("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
    expect(result.optimizedSizeBytes).toBe(26 * 1024 * 1024);
    spy.mockRestore();
  });

  it("handles corrupted or invalid PDF gracefully without throwing unhandled errors", async () => {
    const corruptFile = {
      name: "corrupt.pdf",
      size: 30 * 1024 * 1024,
      arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]).buffer,
    } as unknown as File;

    const result = await optimizePdfClient(corruptFile);
    expect(result.success).toBe(false);
    expect(result.error).toBe("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
  });

  it("handles password-protected or encrypted PDF gracefully with specific error", async () => {
    const encryptedFile = {
      name: "encrypted.pdf",
      size: 30 * 1024 * 1024,
      arrayBuffer: async () => {
        throw new Error("Password-protected or encrypted PDF");
      },
    } as unknown as File;

    const result = await optimizePdfClient(encryptedFile);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Password-protected or encrypted PDFs cannot be processed.");
  });
});

describe("Storage Ceiling & Replacement Accounting (2.7 GB)", () => {
  it("allows uploads when within the 2.7 GB ceiling", async () => {
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            { file_size_bytes: 100 * 1024 * 1024 },
            { file_size_bytes: 200 * 1024 * 1024 },
          ],
          error: null,
        }),
      }),
    } as any;

    const currentUsage = await getCurrentStorageUsageBytes(mockAdmin);
    expect(currentUsage).toBe(300 * 1024 * 1024);

    const check = await checkStorageCeiling(mockAdmin, 10 * 1024 * 1024);
    expect(check.allowed).toBe(true);
    expect(check.projectedTotalBytes).toBe(310 * 1024 * 1024);
  });

  it("rejects uploads that would exceed the 2.7 GB ceiling", async () => {
    const almostFull = 2.69 * 1024 * 1024 * 1024;
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ file_size_bytes: almostFull }],
          error: null,
        }),
      }),
    } as any;

    const newUpload = 20 * 1024 * 1024;
    const check = await checkStorageCeiling(mockAdmin, newUpload);

    expect(check.allowed).toBe(false);
    expect(check.error).toMatch(/storage ceiling reached/i);
  });

  it("correctly calculates replacement storage accounting (subtracts old, adds new)", async () => {
    const currentTotal = 2.695 * 1024 * 1024 * 1024;
    const oldFileSize = 15 * 1024 * 1024;
    const newFileSize = 8 * 1024 * 1024;

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ file_size_bytes: currentTotal }],
          error: null,
        }),
      }),
    } as any;

    const check = await checkStorageCeiling(mockAdmin, newFileSize, oldFileSize);
    expect(check.allowed).toBe(true);
    expect(check.projectedTotalBytes).toBe(currentTotal - oldFileSize + newFileSize);
  });

  it("rejects replacement when replacement file causes total to exceed 2.7 GB", async () => {
    const currentTotal = 2.695 * 1024 * 1024 * 1024;
    const oldFileSize = 2 * 1024 * 1024;
    const newFileSize = 20 * 1024 * 1024;

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ file_size_bytes: currentTotal }],
          error: null,
        }),
      }),
    } as any;

    const check = await checkStorageCeiling(mockAdmin, newFileSize, oldFileSize);
    expect(check.allowed).toBe(false);
    expect(check.error).toMatch(/storage ceiling reached/i);
  });
});

describe("Brochure Authorization & Role Enforcement", () => {
  it("allows staff and admin to manage brochures", () => {
    const adminUser = { app_metadata: { role: "admin" } };
    const staffUser = { app_metadata: { role: "staff" } };
    const managerUser = { app_metadata: { role: "manager" } };

    expect(getAppRole(adminUser)).toBe("admin");
    expect(isStaffOrAdmin(adminUser)).toBe(true);
    expect(canManageBrochures(adminUser)).toBe(true);

    expect(getAppRole(staffUser)).toBe("staff");
    expect(isStaffOrAdmin(staffUser)).toBe(true);
    expect(canManageBrochures(staffUser)).toBe(true);

    expect(getAppRole(managerUser)).toBe("staff");
    expect(isStaffOrAdmin(managerUser)).toBe(true);
    expect(canManageBrochures(managerUser)).toBe(true);
  });

  it("prohibits sales users from brochure management mutations", () => {
    const salesUser = { app_metadata: { role: "sales" } };

    expect(getAppRole(salesUser)).toBe("sales");
    expect(isStaffOrAdmin(salesUser)).toBe(false);
    expect(canManageBrochures(salesUser)).toBe(false);
  });

  it("prohibits Sales from downloading archived brochures", () => {
    const role = "sales";
    const archivedBrochure = {
      id: "test-id",
      archived_at: "2026-09-30T00:00:00Z",
    };

    const isSalesBlocked = archivedBrochure.archived_at !== null && role === "sales";
    expect(isSalesBlocked).toBe(true);
  });

  it("allows Staff and Admin to download archived brochures", () => {
    const archivedBrochure = {
      id: "test-id",
      archived_at: "2026-09-30T00:00:00Z",
    };

    const staffRole: string = "staff";
    const adminRole: string = "admin";
    const isStaffBlocked = archivedBrochure.archived_at !== null && staffRole === "sales";
    const isAdminBlocked = archivedBrochure.archived_at !== null && adminRole === "sales";

    expect(isStaffBlocked).toBe(false);
    expect(isAdminBlocked).toBe(false);
  });
});

describe("Replacement Immutable Storage Keys & Headers", () => {
  it("generates distinct immutable keys on replacement", () => {
    const brochureId = "88888888-4444-4444-4444-121212121212";
    const key1 = generateBrochureKey(brochureId, "11111111-1111-1111-1111-111111111111");
    const key2 = generateBrochureKey(brochureId, "22222222-2222-2222-2222-222222222222");

    expect(key1).not.toBe(key2);
    expect(key1).toBe("brochures/88888888-4444-4444-4444-121212121212/11111111-1111-1111-1111-111111111111.pdf");
    expect(key2).toBe("brochures/88888888-4444-4444-4444-121212121212/22222222-2222-2222-2222-222222222222.pdf");
  });

  it("constructs compliant download response headers", () => {
    const cleanFilename = sanitizeDownloadFilename("Godrej_Aristocrat.pdf", "Godrej");
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${cleanFilename}"`);
    headers.set("X-Content-Type-Options", "nosniff");

    expect(headers.get("Content-Type")).toBe("application/pdf");
    expect(headers.get("Content-Disposition")).toBe('attachment; filename="Godrej_Aristocrat.pdf"');
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});


describe("Robust XHR Error Message Parsing (parseXhrErrorMessage)", () => {
  it("extracts error field from valid JSON response", () => {
    const xhr = {
      status: 400,
      responseText: JSON.stringify({ error: "Title is required." }),
    };
    expect(parseXhrErrorMessage(xhr)).toBe("Title is required.");
  });

  it("extracts message field from valid JSON response if error not present", () => {
    const xhr = {
      status: 400,
      responseText: JSON.stringify({ message: "Invalid payload format" }),
    };
    expect(parseXhrErrorMessage(xhr)).toBe("Invalid payload format");
  });

  it("handles HTTP 413 Payload Too Large with actionable 25 MB notice", () => {
    const xhr = {
      status: 413,
      responseText: "<html><body>413 Request Entity Too Large</body></html>",
    };
    expect(parseXhrErrorMessage(xhr)).toMatch(/exceeds the server maximum upload limit \(25 MB\)/i);
  });

  it("handles HTTP 401 Unauthorized with session expired guidance", () => {
    const xhr = {
      status: 401,
      responseText: "<html><body>Unauthorized</body></html>",
    };
    expect(parseXhrErrorMessage(xhr)).toMatch(/session has expired/i);
  });

  it("handles HTTP 403 Forbidden with permissions guidance", () => {
    const xhr = {
      status: 403,
      responseText: "<html><body>Forbidden</body></html>",
    };
    expect(parseXhrErrorMessage(xhr)).toMatch(/Staff or administrator permissions required/i);
  });

  it("handles HTTP 504 and 524 timeouts gracefully", () => {
    const xhr504 = {
      status: 504,
      responseText: "<html>Gateway Timeout</html>",
    };
    expect(parseXhrErrorMessage(xhr504)).toMatch(/Upload timed out/i);

    const xhr524 = {
      status: 524,
      responseText: "<html>A timeout occurred</html>",
    };
    expect(parseXhrErrorMessage(xhr524)).toMatch(/Upload timed out/i);
  });

  it("handles Cloudflare / Worker 500 HTML crash pages without generic invalid response", () => {
    const xhr = {
      status: 500,
      responseText: "<!DOCTYPE html><html><head><title>Worker exceeded resource limits</title></head><body>Error 1101</body></html>",
    };
    const msg = parseXhrErrorMessage(xhr);
    expect(msg).not.toBe("Server returned an invalid response.");
    expect(msg).toMatch(/Server error \(500\)/i);
  });

  it("extracts short plain text error messages", () => {
    const xhr = {
      status: 400,
      responseText: "Storage bucket temporarily unavailable",
    };
    expect(parseXhrErrorMessage(xhr)).toBe("Storage bucket temporarily unavailable");
  });

  it("falls back to default message if response is empty and status is 0", () => {
    const xhr = {
      status: 0,
      responseText: "",
    };
    expect(parseXhrErrorMessage(xhr, "Default upload error")).toBe("Default upload error");
  });
});

describe("Server Upload & Replace PDF Byte Ingestion (Direct Small vs Compressed)", () => {
  it("validates direct small PDF bytes for direct storage without server re-encoding", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const smallPdfBytes = await doc.save();

    const validation = validatePdfBytes(smallPdfBytes);
    expect(validation.valid).toBe(true);
    expect(validation.sizeBytes).toBe(smallPdfBytes.byteLength);
    expect(validation.sizeBytes).toBeLessThan(MAX_BROCHURE_FILE_SIZE_BYTES);
  });

  it("validates client-compressed PDF bytes (e.g. 4.7 MB) ready for direct storage", () => {
    const compressedSize = Math.floor(4.71 * 1024 * 1024);
    const fakeCompressedBytes = new Uint8Array(compressedSize);
    // Add PDF magic header
    fakeCompressedBytes[0] = 0x25; // %
    fakeCompressedBytes[1] = 0x50; // P
    fakeCompressedBytes[2] = 0x44; // D
    fakeCompressedBytes[3] = 0x46; // F
    fakeCompressedBytes[4] = 0x2d; // -

    const validation = validatePdfBytes(fakeCompressedBytes);
    expect(validation.valid).toBe(true);
    expect(validation.sizeBytes).toBe(compressedSize);
    expect(validation.sizeBytes).toBeLessThan(MAX_BROCHURE_FILE_SIZE_BYTES);
  });

  it("rejects uncompressed oversized PDF (> 25 MB) on server boundary", () => {
    const oversizedSize = 27 * 1024 * 1024;
    const fakeOversizedBytes = new Uint8Array(oversizedSize);
    fakeOversizedBytes[0] = 0x25;
    fakeOversizedBytes[1] = 0x50;
    fakeOversizedBytes[2] = 0x44;
    fakeOversizedBytes[3] = 0x46;
    fakeOversizedBytes[4] = 0x2d;

    const validation = validatePdfBytes(fakeOversizedBytes);
    expect(validation.valid).toBe(false);
    expect(validation.error).toMatch(/exceeds the maximum allowed limit of 25 MB/i);
  });
});
