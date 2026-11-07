"use server";

import { and, count, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { posts, subscribers } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import { getOwnedPost } from "@/lib/posts";
import { processDeliveries, queuePost, sendTestEmail } from "@/lib/sending";
import { SLUG_PATTERN } from "@/lib/slug";
import { randomToken } from "@/lib/tokens";

export async function createPost() {
  const { publication } = await requirePublication();
  const [post] = await db
    .insert(posts)
    .values({
      publicationId: publication.id,
      title: "",
      slug: `untitled-${randomToken()
        .slice(0, 6)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "x")}`,
    })
    .returning({ id: posts.id });
  redirect(`/dashboard/posts/${post.id}`);
}

const postInput = z.object({
  title: z.string().trim().max(200),
  subtitle: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "3–40 characters: lowercase letters, numbers and dashes"),
  content: z.string().max(200_000, "That post is too long"),
});

export type PostInput = z.input<typeof postInput>;
export type SaveResult =
  { ok: true; savedAt: string } | { ok: false; error: string; field?: keyof PostInput };

export async function savePost(postId: string, input: PostInput): Promise<SaveResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  if (owned.post.status !== "draft") return { ok: false, error: "Sent posts can't be edited." };

  const parsed = postInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: issue.path[0] as keyof PostInput };
  }

  try {
    await db
      .update(posts)
      .set(parsed.data)
      .where(and(eq(posts.id, postId), eq(posts.status, "draft")));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Another post already uses this URL.", field: "slug" };
    }
    throw error;
  }
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deletePost(postId: string) {
  const owned = await getOwnedPost(postId);
  if (owned?.post.status === "draft") {
    await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.status, "draft")));
  }
  redirect("/dashboard/posts");
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function sendTest(postId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  if (!owned.post.title.trim()) return { ok: false, error: "Add a title first." };
  try {
    await sendTestEmail(owned.post, owned.publication, owned.user.email);
  } catch (error) {
    console.error("sendTest failed", error);
    return { ok: false, error: "The test email couldn't be sent. Check the email settings." };
  }
  return { ok: true, message: `Test sent to ${owned.user.email}` };
}

export async function sendPost(postId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  const { post, publication } = owned;
  if (post.status !== "draft") return { ok: false, error: "This post has already been sent." };
  if (!post.title.trim()) return { ok: false, error: "Add a title before sending." };
  if (!post.content.trim()) return { ok: false, error: "Write something before sending." };
  if (post.slug.startsWith("untitled-")) {
    return { ok: false, error: "Set the post URL before sending." };
  }

  const [{ active }] = await db
    .select({ active: count() })
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.status, "active")));
  if (active === 0) return { ok: false, error: "You don't have any confirmed subscribers yet." };

  const queued = await queuePost(post.id, publication.id);
  if (queued === null) return { ok: false, error: "This post has already been sent." };

  // Respond right away; the batches go out after the response.
  after(() => processDeliveries(post.id).catch((e) => console.error("send failed", post.id, e)));
  refresh();
  return { ok: true, message: `Sending to ${queued.toLocaleString("en")} subscribers…` };
}

/** Restarts a send that stopped part-way (e.g. the server restarted). */
export async function resumeSend(postId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned || owned.post.status !== "sending") return { ok: false, error: "Nothing to resume." };
  after(() => processDeliveries(postId).catch((e) => console.error("resume failed", postId, e)));
  refresh();
  return { ok: true, message: "Resumed." };
}
