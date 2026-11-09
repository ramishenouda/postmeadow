import { getPublicationForUser, getSession } from "@/lib/dal";
import { ImageError, MAX_UPLOAD_BYTES } from "@/lib/images/process";
import { saveImage } from "@/lib/images/service";
import { hit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report";

/** Upload an image (multipart form, field "file"). Returns { id, url, width, height, bytes }. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });

  // Refuse oversized bodies before reading them.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "Images can be at most 10 MB." }, { status: 413 });
  }

  if (!(await hit(`upload:${session.user.id}`, { limit: 120, windowSeconds: 60 * 60 }))) {
    return Response.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Send the image as multipart form data." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an image to upload." }, { status: 400 });
  }

  // A teammate's uploads count toward the publication owner's storage.
  const owner = (await getPublicationForUser(session.user.id))?.ownerId ?? session.user.id;
  try {
    const image = await saveImage(owner, Buffer.from(await file.arrayBuffer()), file.name || null);
    return Response.json(image, { status: 201 });
  } catch (error) {
    if (error instanceof ImageError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    reportError("upload failed", error);
    return Response.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
