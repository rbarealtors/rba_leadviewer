import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import jpeg from "jpeg-js";

export type OptimizePdfPhase =
  | "reading"
  | "analyzing"
  | "optimizing_images"
  | "rebuilding"
  | "finalizing"
  | "complete";

export interface OptimizePdfProgress {
  phase: OptimizePdfPhase;
  phaseLabel: string;
  currentImage?: number;
  totalImages?: number;
  detail?: string;
  percent?: number;
}

export interface OptimizePdfResult {
  optimizedBytes: Uint8Array;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  imagesOptimized: number;
}

/**
 * Optimizes a PDF for mobile-first sales viewing and downloads:
 * 1. Checks encryption / password protection.
 * 2. Downsamples and compresses oversized embedded JPEG images (>1600px, 75 quality)
 *    while preserving vector text, floor plans, tables, and legibility.
 * 3. Compacts structural PDF objects using object streams (PDF 1.5 xref streams).
 * 4. Strictly validates the optimized output before returning.
 * 5. Reports real progress through onProgress callback and yields to event loop.
 */
export async function optimizePdf(
  inputBuffer: ArrayBuffer | Uint8Array,
  onProgress?: (progress: OptimizePdfProgress) => void,
): Promise<OptimizePdfResult> {
  const inputBytes =
    inputBuffer instanceof Uint8Array
      ? inputBuffer
      : new Uint8Array(inputBuffer);

  const originalSizeBytes = inputBytes.byteLength;

  if (originalSizeBytes === 0) {
    throw new Error("Cannot optimize an empty PDF file.");
  }

  onProgress?.({
    phase: "reading",
    phaseLabel: "Reading PDF",
    detail: "Parsing document structure...",
    percent: 5,
  });

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(inputBytes, { ignoreEncryption: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("encrypt") || message.toLowerCase().includes("password")) {
      throw new Error(
        "Password-protected or encrypted PDFs cannot be processed. Please provide an unencrypted PDF.",
      );
    }
    throw new Error(
      `Invalid or corrupted PDF file: ${message || "Could not parse document structure."}`,
    );
  }

  const originalPageCount = doc.getPageCount();
  if (originalPageCount === 0) {
    throw new Error("The provided PDF contains no pages.");
  }

  onProgress?.({
    phase: "analyzing",
    phaseLabel: "Analyzing images",
    detail: "Scanning embedded images...",
    percent: 15,
  });

  let imagesOptimized = 0;
  const MAX_IMAGE_DIMENSION = 1600;
  const JPEG_QUALITY = 75;

  interface ImageCandidate {
    ref: unknown;
    obj: PDFRawStream;
  }
  const candidates: ImageCandidate[] = [];

  // Pass 1: Discover candidate images to establish real total count
  try {
    const entries = doc.context.enumerateIndirectObjects();
    for (const [ref, obj] of entries) {
      if (!(obj instanceof PDFRawStream)) continue;

      const subtype = obj.dict.get(PDFName.of("Subtype"));
      const filter = obj.dict.get(PDFName.of("Filter"));

      // Target JPEG images (DCTDecode filter, either as single PDFName or [ /DCTDecode ] PDFArray)
      let isDct = false;
      if (filter === PDFName.of("DCTDecode")) {
        isDct = true;
      } else if (filter instanceof PDFArray) {
        if (filter.size() === 1 && filter.get(0) === PDFName.of("DCTDecode")) {
          isDct = true;
        }
      }

      if (
        subtype === PDFName.of("Image") &&
        isDct &&
        obj.contents &&
        obj.contents.length > 0
      ) {
        candidates.push({ ref, obj });
      }
    }
  } catch (inspectErr) {
    console.warn("[PDF Optimize] Warning during image inspection:", inspectErr);
  }

  const totalCandidates = candidates.length;

  // Pass 2: Optimize candidate images with incremental progress updates
  for (let i = 0; i < totalCandidates; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    const { ref, obj } = candidate;
    const imageNum = i + 1;
    const progressPercent = Math.round(15 + (imageNum / totalCandidates) * 70);

    onProgress?.({
      phase: "optimizing_images",
      phaseLabel: "Optimizing images",
      currentImage: imageNum,
      totalImages: totalCandidates,
      detail: `Optimizing image ${imageNum} of ${totalCandidates}`,
      percent: progressPercent,
    });

    // Yield to the browser event loop so progress updates render immediately
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const decoded = jpeg.decode(obj.contents);
      if (!decoded || !decoded.width || !decoded.height) continue;

      let targetWidth = decoded.width;
      let targetHeight = decoded.height;

      // Downsample oversized images for mobile-first viewing while preserving legibility
      if (targetWidth > MAX_IMAGE_DIMENSION || targetHeight > MAX_IMAGE_DIMENSION) {
        const scale = Math.min(
          MAX_IMAGE_DIMENSION / targetWidth,
          MAX_IMAGE_DIMENSION / targetHeight,
        );
        targetWidth = Math.max(1, Math.round(targetWidth * scale));
        targetHeight = Math.max(1, Math.round(targetHeight * scale));
      }

      let outBuffer: Uint8Array = decoded.data;
      if (targetWidth !== decoded.width || targetHeight !== decoded.height) {
        // Nearest-neighbor / bilinear sample to scale dimensions
        const scaled = new Uint8Array(targetWidth * targetHeight * 4);
        const xRatio = decoded.width / targetWidth;
        const yRatio = decoded.height / targetHeight;

        for (let y = 0; y < targetHeight; y++) {
          const srcY = Math.min(Math.floor(y * yRatio), decoded.height - 1);
          for (let x = 0; x < targetWidth; x++) {
            const srcX = Math.min(Math.floor(x * xRatio), decoded.width - 1);
            const srcIdx = (srcY * decoded.width + srcX) * 4;
            const dstIdx = (y * targetWidth + x) * 4;

            scaled[dstIdx] = decoded.data[srcIdx] ?? 0;
            scaled[dstIdx + 1] = decoded.data[srcIdx + 1] ?? 0;
            scaled[dstIdx + 2] = decoded.data[srcIdx + 2] ?? 0;
            scaled[dstIdx + 3] = decoded.data[srcIdx + 3] ?? 255;
          }
        }
        outBuffer = scaled;
      }

      const reencoded = jpeg.encode(
        { data: outBuffer, width: targetWidth, height: targetHeight },
        JPEG_QUALITY,
      );

      // Only replace if re-encoding actually reduces size
      if (reencoded.data.length < obj.contents.length) {
        obj.dict.set(PDFName.of("Width"), PDFNumber.of(targetWidth));
        obj.dict.set(PDFName.of("Height"), PDFNumber.of(targetHeight));
        obj.dict.set(PDFName.of("Length"), PDFNumber.of(reencoded.data.length));
        obj.dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));

        const newStream = PDFRawStream.of(
          obj.dict,
          new Uint8Array(reencoded.data),
        );
        doc.context.assign(ref as any, newStream);
        imagesOptimized++;
      }
    } catch {
      // If decoding/re-encoding a specific image fails, preserve original safely
    }
  }

  // Save with compressed object streams (PDF 1.5+)
  onProgress?.({
    phase: "rebuilding",
    phaseLabel: "Rebuilding PDF",
    detail: "Compressing object streams and structure...",
    percent: 90,
  });

  let optimizedBytes: Uint8Array;
  try {
    optimizedBytes = await doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
  } catch (saveErr) {
    throw new Error(
      `Failed to generate optimized PDF: ${saveErr instanceof Error ? saveErr.message : "Unknown error"}`,
    );
  }

  // Strictly validate the resulting optimized PDF
  onProgress?.({
    phase: "finalizing",
    phaseLabel: "Finalizing",
    detail: "Verifying document integrity...",
    percent: 98,
  });

  try {
    const verifiedDoc = await PDFDocument.load(optimizedBytes, {
      ignoreEncryption: false,
    });
    if (verifiedDoc.getPageCount() !== originalPageCount) {
      throw new Error("Page count mismatch after PDF optimization.");
    }
  } catch (verifyErr) {
    throw new Error(
      `Optimized PDF failed integrity validation: ${verifyErr instanceof Error ? verifyErr.message : "Unknown error"}`,
    );
  }

  onProgress?.({
    phase: "complete",
    phaseLabel: "Complete",
    detail: "Optimization complete!",
    percent: 100,
  });

  return {
    optimizedBytes,
    originalSizeBytes,
    optimizedSizeBytes: optimizedBytes.byteLength,
    imagesOptimized,
  };
}
