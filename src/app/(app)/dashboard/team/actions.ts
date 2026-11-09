"use server";

import { and, eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { publicationTag } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { publicationMembers, teamInvites } from "@/db/schema";
import { getMembership, requirePublication, requireUser } from "@/lib/dal";
import { emailSchema } from "@/lib/subscribers";
import { findTeamInvite, inviteTeammate, isTeamRole } from "@/lib/team";

export type TeamResult = { ok: true; message: string } | { ok: false; error: string };

export async function inviteToTeam(email: string, role: string): Promise<TeamResult> {
  const { user: me, publication } = await requirePublication("owner");
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  if (!isTeamRole(role)) return { ok: false, error: "Pick a role." };
  const error = await inviteTeammate(publication, me.name || me.email, parsed.data, role);
  if (error) return { ok: false, error };
  refresh();
  return { ok: true, message: `Invitation sent to ${parsed.data}.` };
}

export async function revokeInvite(id: string): Promise<TeamResult> {
  const { publication } = await requirePublication("owner");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Not found." };
  await db
    .delete(teamInvites)
    .where(and(eq(teamInvites.id, id), eq(teamInvites.publicationId, publication.id)));
  refresh();
  return { ok: true, message: "Invitation withdrawn." };
}

export async function setMemberRole(userId: string, role: string): Promise<TeamResult> {
  const { publication } = await requirePublication("owner");
  if (!isTeamRole(role)) return { ok: false, error: "Pick a role." };
  await db
    .update(publicationMembers)
    .set({ role })
    .where(
      and(
        eq(publicationMembers.publicationId, publication.id),
        eq(publicationMembers.userId, userId),
      ),
    );
  refresh();
  return { ok: true, message: "Role changed." };
}

export async function removeMember(userId: string): Promise<TeamResult> {
  const { publication } = await requirePublication("owner");
  await db
    .delete(publicationMembers)
    .where(
      and(
        eq(publicationMembers.publicationId, publication.id),
        eq(publicationMembers.userId, userId),
      ),
    );
  refresh();
  return { ok: true, message: "Removed from the team. Their posts stay." };
}

/** A teammate leaves the team themselves. */
export async function leaveTeam() {
  const { user: me, role } = await requirePublication();
  if (role !== "owner") {
    await db.delete(publicationMembers).where(eq(publicationMembers.userId, me.id));
  }
  redirect("/onboarding");
}

/** Your name, shown as the byline on posts you write. */
export async function setMyName(name: string): Promise<TeamResult> {
  const me = await requireUser();
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  await db.update(user).set({ name: clean }).where(eq(user.id, me.id));
  // Bylines appear on the public pages.
  const membership = await getMembership(me.id);
  if (membership) updateTag(publicationTag(membership.publication.slug));
  refresh();
  return { ok: true, message: "Saved." };
}

export async function acceptTeamInvite(token: string): Promise<TeamResult> {
  const me = await requireUser();
  const invite = await findTeamInvite(token);
  if (!invite) return { ok: false, error: "This invitation was withdrawn or already used." };
  if (invite.email !== me.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invitation is for ${invite.email}. Sign out and sign in with that address.`,
    };
  }
  const existing = await getMembership(me.id);
  if (existing) {
    return {
      ok: false,
      error:
        existing.publication.id === invite.publicationId
          ? "You're already on this team."
          : `This account already works on ${existing.publication.name}. Use a different email address for this team.`,
    };
  }
  const role = isTeamRole(invite.role) ? invite.role : "contributor";
  await db.transaction(async (tx) => {
    await tx
      .insert(publicationMembers)
      .values({ publicationId: invite.publicationId, userId: me.id, role })
      .onConflictDoNothing();
    await tx.delete(teamInvites).where(eq(teamInvites.id, invite.id));
  });
  redirect("/dashboard");
}
