import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { publicationMembers, publications, teamInvites } from "@/db/schema";
import { getBilling } from "@/lib/billing/service";
import { sendNotice } from "@/lib/notify";
import { teammateLimit } from "@/lib/plans";
import { randomToken } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/urls";

/**
 * Teams: the owner invites people by email as editors or contributors. They accept
 * while signed in with that address; one account can be on one team (or own one
 * publication), because the dashboard shows a single publication.
 */

export const TEAM_ROLES = {
  editor: "Editor: writes, sends and manages subscribers, automations and settings",
  contributor: "Contributor: writes drafts; an editor sends them",
} as const;
export type TeamRole = keyof typeof TEAM_ROLES;
export const isTeamRole = (r: string): r is TeamRole => r in TEAM_ROLES;

export async function teamOverview(publicationId: string, ownerId: string) {
  const [owner, members, invites] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, ownerId))
      .then((r) => r[0]),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: publicationMembers.role,
        since: publicationMembers.createdAt,
      })
      .from(publicationMembers)
      .innerJoin(user, eq(user.id, publicationMembers.userId))
      .where(eq(publicationMembers.publicationId, publicationId))
      .orderBy(asc(publicationMembers.createdAt)),
    db
      .select({
        id: teamInvites.id,
        email: teamInvites.email,
        role: teamInvites.role,
        createdAt: teamInvites.createdAt,
      })
      .from(teamInvites)
      .where(eq(teamInvites.publicationId, publicationId))
      .orderBy(asc(teamInvites.createdAt)),
  ]);
  return { owner, members, invites };
}

/** Places left on the team (members plus pending invitations count). */
export async function seatsLeft(publicationId: string, ownerId: string) {
  const [[{ members }], [{ invites }], billing] = await Promise.all([
    db
      .select({ members: count() })
      .from(publicationMembers)
      .where(eq(publicationMembers.publicationId, publicationId)),
    db
      .select({ invites: count() })
      .from(teamInvites)
      .where(eq(teamInvites.publicationId, publicationId)),
    getBilling(ownerId),
  ]);
  const limit = teammateLimit(billing?.plan ?? "free");
  return { limit, left: Math.max(0, limit - members - invites) };
}

export async function inviteTeammate(
  publication: { id: string; name: string; ownerId: string },
  inviterName: string,
  email: string,
  role: TeamRole,
): Promise<string | null> {
  const [taken] = await db
    .select({ id: user.id })
    .from(publicationMembers)
    .innerJoin(user, eq(user.id, publicationMembers.userId))
    .where(and(eq(publicationMembers.publicationId, publication.id), eq(user.email, email)));
  const [owner] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, publication.ownerId));
  if (taken || owner?.email === email) return "They're already on the team.";
  const { left, limit } = await seatsLeft(publication.id, publication.ownerId);
  if (left === 0) {
    return `Your plan includes ${limit} ${limit === 1 ? "teammate" : "teammates"}. Upgrade for more, or remove someone first.`;
  }
  const token = randomToken();
  await db
    .insert(teamInvites)
    .values({ publicationId: publication.id, email, role, token })
    .onConflictDoUpdate({
      target: [teamInvites.publicationId, teamInvites.email],
      set: { role, token, createdAt: new Date() },
    });
  await sendNotice(email, `${inviterName} invited you to ${publication.name}`, {
    title: `Join ${publication.name} on Postmeadow`,
    paragraphs: [
      `${inviterName} invited you to work on ${publication.name} as ${role === "editor" ? "an editor" : "a contributor"}.`,
      TEAM_ROLES[role] + ".",
      `Sign in with this address (${email}) to accept. If you weren't expecting this, ignore it.`,
    ],
    action: { label: "Accept the invitation", url: absoluteUrl(`/dashboard/join/${token}`) },
  });
  return null;
}

export async function findTeamInvite(token: string) {
  if (!/^[\w-]{20,}$/.test(token)) return null;
  const [row] = await db
    .select({
      id: teamInvites.id,
      email: teamInvites.email,
      role: teamInvites.role,
      publicationId: teamInvites.publicationId,
      publicationName: publications.name,
    })
    .from(teamInvites)
    .innerJoin(publications, eq(publications.id, teamInvites.publicationId))
    .where(eq(teamInvites.token, token));
  return row ?? null;
}
