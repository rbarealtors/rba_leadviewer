import { optimizePdf, OptimizePdfProgress } from "./optimize";
import {
  MAX_BROCHURE_FILE_SIZE_BYTES,
} from "./types";
import { formatFileSize } from "./validate";

export interface ClientOptimizeResult {
  success: boolean;
  file?: File;
  originalSizeBytes: number;
  optimizedSizeBytes?: number;
  error?: string;
  reductionPercent?: number;
}

export const DEFAULT_CLIENT_OPTIMIZE_SOURCE_MB = 150;
export const DEFAULT_CLIENT_OPTIMIZE_SOURCE_BYTES =
  DEFAULT_CLIENT_OPTIMIZE_SOURCE_MB * 1024 * 1024;

/**
 * Default maximum file size that the client will attempt to parse in-browser (150 MB).
 * Protects mobile and desktop browsers from allocating huge amounts of RAM and crashing the tab.
 * Can be overridden by Admin configuration via system settings.
 */
export const MAX_CLIENT_OPTIMIZE_SOURCE_BYTES = DEFAULT_CLIENT_OPTIMIZE_SOURCE_BYTES;

/**
 * Optimizes an oversized PDF in the client browser:
 * - If file <= 25 MB: returns success immediately with original file.
 * - If file > maxSourceSizeBytes: rejects immediately to avoid crashing the browser tab.
 * - If 25 MB < file <= maxSourceSizeBytes: runs in-memory optimization using pdf-lib and jpeg-js.
 * - If optimized result <= 25 MB: returns new File object.
 * - If optimized result > 25 MB: returns clear error.
 * - Emits real progress updates through onProgress.
 */
export async function optimizePdfClient(
  file: File,
  onProgress?: (progress: OptimizePdfProgress) => void,
  maxSourceSizeBytes: number = DEFAULT_CLIENT_OPTIMIZE_SOURCE_BYTES,
): Promise<ClientOptimizeResult> {
  const originalSizeBytes = file.size;

  if (originalSizeBytes === 0) {
    return {
      success: false,
      originalSizeBytes,
      error: "The selected file is empty.",
    };
  }

  // If already <= 25 MB, no client optimization required
  if (originalSizeBytes <= MAX_BROCHURE_FILE_SIZE_BYTES) {
    return {
      success: true,
      file,
      originalSizeBytes,
      optimizedSizeBytes: originalSizeBytes,
      reductionPercent: 0,
    };
  }

  // Bounded source limit to prevent browser tab crashes from astronomical files (checked before arrayBuffer)
  if (originalSizeBytes > maxSourceSizeBytes) {
    return {
      success: false,
      originalSizeBytes,
      error: `This PDF is ${formatFileSize(originalSizeBytes)}, which is too large for browser processing. Please choose a PDF under ${formatFileSize(maxSourceSizeBytes)}.`,
    };
  }

  try {
    onProgress?.({
      phase: "reading",
      phaseLabel: "Reading PDF",
      detail: `Reading ${formatFileSize(originalSizeBytes)} document...`,
      percent: 5,
    });

    const arrayBuffer = await file.arrayBuffer();
    const result = await optimizePdf(arrayBuffer, onProgress);

    if (result.optimizedSizeBytes <= MAX_BROCHURE_FILE_SIZE_BYTES) {
      const optimizedFile = new File([result.optimizedBytes as unknown as BlobPart], file.name, {
        type: "application/pdf",
        lastModified: Date.now(),
      });

      const reduction = Math.max(
        0,
        Math.round(
          ((originalSizeBytes - result.optimizedSizeBytes) / originalSizeBytes) * 100,
        ),
      );

      return {
        success: true,
        file: optimizedFile,
        originalSizeBytes,
        optimizedSizeBytes: result.optimizedSizeBytes,
        reductionPercent: reduction,
      };
    } else {
      return {
        success: false,
        originalSizeBytes,
        optimizedSizeBytes: result.optimizedSizeBytes,
        error: "This PDF could not be reduced below 25 MB. Please choose a smaller PDF.",
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("encrypt") || message.toLowerCase().includes("password")) {
      return {
        success: false,
        originalSizeBytes,
        error: "Password-protected or encrypted PDFs cannot be processed.",
      };
    }

    return {
      success: false,
      originalSizeBytes,
      error: "This PDF could not be reduced below 25 MB. Please choose a smaller PDF.",
    };
  }
}
