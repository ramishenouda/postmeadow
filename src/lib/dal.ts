import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { publicationMembers, publications } from "@/db/schema";
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

/**
 * What a user can do on a publication. Owners can do everything; editors everything
 * but billing and the team; contributors write drafts (an editor sends them).
 */
export type Role = "owner" | "editor" | "contributor";
const RANK: Record<Role, number> = { contributor: 0, editor: 1, owner: 2 };
export const hasRole = (role: Role, min: Role) => RANK[role] >= RANK[min];

/** The publication the user works on (their own, or the team they joined) and their role. */
export const getMembership = cache(async (userId: string) => {
  const [owned] = await db
    .select()
    .from(publications)
    .where(eq(publications.ownerId, userId))
    .orderBy(asc(publications.createdAt))
    .limit(1);
  if (owned) return { publication: owned, role: "owner" as Role };
  const [member] = await db
    .select({ publication: publications, role: publicationMembers.role })
    .from(publicationMembers)
    .innerJoin(publications, eq(publications.id, publicationMembers.publicationId))
    .where(eq(publicationMembers.userId, userId))
    .limit(1);
  if (!member) return null;
  return {
    publication: member.publication,
    role: (member.role === "editor" ? "editor" : "contributor") as Role,
  };
});

/** The user's publication (their own or their team's), or null. */
export const getPublicationForUser = cache(
  async (userId: string) => (await getMembership(userId))?.publication ?? null,
);

/**
 * The signed-in user, their publication and role. Sends people without one to
 * onboarding, and people without the `min` role back to the dashboard.
 */
export async function requirePublication(min: Role = "contributor") {
  const user = await requireUser();
  const membership = await getMembership(user.id);
  if (!membership) redirect("/onboarding");
  if (!hasRole(membership.role, min)) redirect("/dashboard?denied=1");
  return { user, publication: membership.publication, role: membership.role };
}
