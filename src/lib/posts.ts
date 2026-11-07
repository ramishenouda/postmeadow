import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { requirePublication } from "@/lib/dal";

/** A post belonging to the signed-in user's publication, or null. */
export async function getOwnedPost(postId: string) {
  const { user, publication } = await requirePublication();
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.publicationId, publication.id)))
    .limit(1);
  return post ? { user, publication, post } : null;
}
