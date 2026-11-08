export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type UploadedImage = { id: string; url: string; width: number; height: number };

/** Uploads an image to our storage. Throws an Error with a user-facing message. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Upload a PNG, JPEG, GIF or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Images can be at most 10 MB.");
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed. Try again.");
  return data as UploadedImage;
}
