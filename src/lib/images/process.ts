import sharp, { type Metadata } from "sharp";

/** Uploads bigger than this are refused before any processing. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Wider images are scaled down: emails are ~600px wide, 2× for sharp screens is plenty. */
export const MAX_WIDTH = 1600;

export type ProcessedImage = {
  body: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/gif";
  extension: "png" | "jpg" | "gif";
  width: number;
  height: number;
};

export class ImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImageError";
  }
}

/**
 * Validates and normalises an uploaded image:
 * - decodes it (rejects anything that isn't really a PNG, JPEG, GIF or WebP)
 * - applies EXIF rotation, then drops all metadata (GPS location, camera details)
 * - scales it down to MAX_WIDTH
 * - re-encodes: WebP becomes JPEG/PNG because Outlook can't show WebP; GIFs keep animation
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageError("Images can be at most 10 MB.", 413);
  }

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageError("That file isn't an image we can read.", 415);
  }
  if (!meta.format || !["png", "jpeg", "gif", "webp"].includes(meta.format)) {
    throw new ImageError("Upload a PNG, JPEG, GIF or WebP image.", 415);
  }
  if ((meta.width ?? 0) * (meta.pageHeight ?? meta.height ?? 0) > 50_000_000) {
    throw new ImageError("That image has too many pixels.", 413);
  }

  const animated = meta.format === "gif" && (meta.pages ?? 1) > 1;
  let pipeline = sharp(input, { animated, limitInputPixels: 50_000_000 })
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize({ width: MAX_WIDTH, withoutEnlargement: true });

  let contentType: ProcessedImage["contentType"];
  let extension: ProcessedImage["extension"];
  if (meta.format === "gif") {
    pipeline = pipeline.gif();
    contentType = "image/gif";
    extension = "gif";
  } else if (meta.format === "png" || (meta.format === "webp" && meta.hasAlpha)) {
    pipeline = pipeline.png({ compressionLevel: 9, palette: false });
    contentType = "image/png";
    extension = "png";
  } else {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true });
    contentType = "image/jpeg";
    extension = "jpg";
  }

  // sharp drops metadata unless .withMetadata() is called.
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    body: data,
    contentType,
    extension,
    width: info.width,
    height: animated ? (info.pageHeight ?? info.height) : info.height,
  };
}
