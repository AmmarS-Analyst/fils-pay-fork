import sharp from "sharp";
import { UnprocessableEntityError } from "../lib/errors.js";
import type { DetectedFileType } from "./fileSignature.js";

/**
 * Longest side, in pixels.
 */
const THUMBNAIL_MAX_DIMENSION_PX = 320;
const MAX_INPUT_PIXELS = 50_000_000;

export interface GeneratedThumbnail {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Generates a review-UI-sized thumbnail from an already-validated upload
 * buffer. Only `jpeg`/`png` documents get one — a `pdf` (commercial
 * registration, bank letter) has no image to thumbnail, and this returns
 * `null` rather than attempting a PDF-to-image conversion. Always
 * re-encodes to JPEG regardless of the source format, so the admin
 * console's `<img>` tag never needs to branch on thumbnail mime type the
 * way the original-file endpoint does.
 */
export async function generateKycThumbnail(
  buffer: Buffer,
  detectedType: DetectedFileType,
): Promise<GeneratedThumbnail | null> {
  if (detectedType !== "jpeg" && detectedType !== "png") {
    return null;
  }
  // The 8 MiB upload cap limits the file, not the decoded size: a tiny PNG can
  // claim huge dimensions and sharp's default limit is ~268 megapixels (about
  // 800 MB of RGB). Documents and photos here are far smaller than 50 MP.
  try {
    const resized = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(THUMBNAIL_MAX_DIMENSION_PX, THUMBNAIL_MAX_DIMENSION_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { buffer: resized, mimeType: "image/jpeg" };
  } catch (err) {
    if (err instanceof Error && /pixel limit/i.test(err.message)) {
      throw new UnprocessableEntityError("image_too_large", "the image dimensions are too large");
    }
    throw err;
  }
}
