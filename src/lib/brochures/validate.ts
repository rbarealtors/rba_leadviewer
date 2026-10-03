import {
  ALLOWED_BROCHURE_MIME_TYPE,
  MAX_BROCHURE_FILE_SIZE_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  BROCHURES_STORAGE_BUCKET,
} from "./types";

/**
 * Validates a binary buffer for PDF characteristics:
 * - Non-empty
 * - Enforces server-side size limit (25 MB)
 * - Verifies `%PDF-` magic header bytes
 */
export function validatePdfBytes(buffer: ArrayBuffer | Uint8Array): {
  valid: boolean;
  error?: string;
  sizeBytes: number;
} {
  const sizeBytes =
    buffer && typeof (buffer as { byteLength?: number }).byteLength === "number"
      ? (buffer as { byteLength: number }).byteLength
      : 0;

  if (sizeBytes === 0) {
    return { valid: false, error: "The provided file is empty.", sizeBytes };
  }

  if (sizeBytes > MAX_BROCHURE_FILE_SIZE_BYTES) {
    const maxMb = Math.round(MAX_BROCHURE_FILE_SIZE_BYTES / (1024 * 1024));
    return {
      valid: false,
      error: `File size (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of ${maxMb} MB.`,
      sizeBytes,
    };
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Check magic bytes "%PDF-" (hex: 25 50 44 46 2D)
  if (
    sizeBytes < 5 ||
    bytes[0] !== 0x25 || // %
    bytes[1] !== 0x50 || // P
    bytes[2] !== 0x44 || // D
    bytes[3] !== 0x46 || // F
    bytes[4] !== 0x2d // -
  ) {
    return {
      valid: false,
      error: "Invalid file format. The file does not have a valid PDF header.",
      sizeBytes,
    };
  }

  return { valid: true, sizeBytes };
}

/**
 * Trims and collapses multiple spaces in a project name.
 * Normalizes empty strings to null.
 */
export function normalizeProjectName(
  projectName: string | null | undefined,
): string | null {
  if (!projectName) return null;
  const cleaned = projectName.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Validates and cleans a brochure title.
 */
export function validateTitle(title: string | null | undefined): {
  valid: boolean;
  title: string;
  error?: string;
} {
  if (!title) {
    return { valid: false, title: "", error: "Title is required." };
  }

  const cleaned = title.trim();
  if (cleaned.length === 0) {
    return { valid: false, title: "", error: "Title cannot be empty or only whitespace." };
  }

  if (cleaned.length > 200) {
    return { valid: false, title: cleaned, error: "Title must be 200 characters or fewer." };
  }

  return { valid: true, title: cleaned };
}

/**
 * Generates an immutable storage key.
 * Format: brochures/{brochure_id}/{file_uuid}.pdf
 */
export function generateBrochureKey(brochureId: string, fileUuid: string): string {
  return `brochures/${brochureId}/${fileUuid}.pdf`;
}

/**
 * Cleans a filename for Content-Disposition headers.
 * Strips path traversal, newlines, carriage returns, and quotes.
 */
export function sanitizeDownloadFilename(
  originalFilename: string | null | undefined,
  fallbackTitle: string,
): string {
  const base = (originalFilename || fallbackTitle || "brochure")
    .trim()
    .replace(/[\r\n\t"]/g, "") // Strip newlines, tabs, quotes
    .replace(/[\\/]/g, "_") // Strip path traversal
    .replace(/[^\w\s.-]/g, "_"); // Keep letters, numbers, spaces, dots, dashes

  const nameWithoutExt = base.replace(/\.pdf$/i, "").trim() || "brochure";
  return `${nameWithoutExt}.pdf`;
}

/**
 * Formats byte size into human readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}


/**
 * Safely parses and normalizes error messages from XHR upload responses.
 * Prevents displaying cryptic "Server returned an invalid response" to users
 * and extracts the true HTTP error status, JSON message, or plain-text reason.
 */
export function parseXhrErrorMessage(
  xhr: { status?: number; statusText?: string; responseText?: string },
  defaultMessage: string = "Upload failed. Please try again.",
): string {
  if (xhr.responseText) {
    try {
      const res = JSON.parse(xhr.responseText);
      if (res && typeof res.error === "string" && res.error.trim()) {
        return res.error.trim();
      }
      if (res && typeof res.message === "string" && res.message.trim()) {
        return res.message.trim();
      }
    } catch {
      // Not JSON: check if responseText is a short plain-text error message
      const text = xhr.responseText.trim();
      if (text && text.length < 200 && !text.startsWith("<")) {
        return text;
      }
    }
  }

  const status = xhr.status || 0;
  if (status === 413) {
    return "Upload failed: The file exceeds the server maximum upload limit (25 MB).";
  }
  if (status === 401) {
    return "Your session has expired. Please refresh the page and log in again.";
  }
  if (status === 403) {
    return "Permission denied: Staff or administrator permissions required.";
  }
  if (status === 504 || status === 524) {
    return "Upload timed out. Please check your network connection and try again.";
  }
  if (status >= 500) {
    return `Server error (${status}). Please try again or contact administrator.`;
  }
  if (status > 0) {
    return `Upload failed with status ${status} (${xhr.statusText || defaultMessage}).`;
  }

  return defaultMessage;
}

export const BROCHURE_CONSTANTS = {
  MAX_FILE_SIZE_BYTES: MAX_BROCHURE_FILE_SIZE_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  MIME_TYPE: ALLOWED_BROCHURE_MIME_TYPE,
  STORAGE_BUCKET: BROCHURES_STORAGE_BUCKET,
};

export {
  MAX_BROCHURE_FILE_SIZE_BYTES,
  MAX_TOTAL_STORAGE_BYTES,
  ALLOWED_BROCHURE_MIME_TYPE,
  BROCHURES_STORAGE_BUCKET,
};
