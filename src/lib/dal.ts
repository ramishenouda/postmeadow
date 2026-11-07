import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { publications } from "@/db/schema";
import { auth } from "@/lib/auth";

/**
 * Data Access Layer: every server-side read of "who is this?" goes through here.
 * These read the request, so call them only inside a <Suspense> boundary,
 * a Server Action or a Route Handler.
 */

/** The current session, or null. Deduplicated per request. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** The signed-in user. Redirects to /sign-in when there is no valid session. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { id, email, name } = session.user;
  return { id, email, name };
}

export type CurrentUser = Awaited<ReturnType<typeof requireUser>>;

/** The user's publication (the MVP has one per user), or null. */
export const getPublicationForUser = cache(async (userId: string) => {
  const [publication] = await db
    .select()
    .from(publications)
    .where(eq(publications.ownerId, userId))
    .orderBy(asc(publications.createdAt))
    .limit(1);
  return publication ?? null;
});

/** The signed-in user and their publication. Sends them to onboarding if they have none. */
export async function requirePublication() {
  const user = await requireUser();
  const publication = await getPublicationForUser(user.id);
  if (!publication) redirect("/onboarding");
  return { user, publication };
}
