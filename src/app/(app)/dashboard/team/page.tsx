import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { seatsLeft, teamOverview } from "@/lib/team";
import {
  InviteForm,
  LeaveTeamButton,
  MemberControls,
  MyNameForm,
  RevokeButton,
} from "./team-forms";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm">
          Write together. Editors can do everything except billing and the team; contributors write
          drafts that an editor sends.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-80 animate-pulse rounded-xl" />}>
        <Team />
      </Suspense>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  editor: "Editor",
  contributor: "Contributor",
};

async function Team() {
  const { user, publication, role } = await requirePublication();
  const [{ owner, members, invites }, seats] = await Promise.all([
    teamOverview(publication.id, publication.ownerId),
    seatsLeft(publication.id, publication.ownerId),
  ]);
  const isOwner = role === "owner";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>Shown as the byline on posts you write.</CardDescription>
        </CardHeader>
        <CardContent>
          <MyNameForm name={user.name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            {isOwner
              ? `${seats.left} of ${seats.limit} ${seats.limit === 1 ? "place" : "places"} left on your plan.`
              : `You're ${role === "editor" ? "an editor" : "a contributor"} on ${publication.name}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-lg border text-sm">
            {owner ? (
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="font-medium">{owner.name || owner.email}</span>
                  {owner.name ? (
                    <span className="text-muted-foreground block text-xs">{owner.email}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">{ROLE_LABEL.owner}</span>
              </li>
            ) : null}
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <span>
                  <span className="font-medium">{m.name || m.email}</span>
                  <span className="text-muted-foreground block text-xs">
                    {m.name ? `${m.email} · ` : ""}since {formatDate(m.since)}
                  </span>
                </span>
                {isOwner ? (
                  <MemberControls userId={m.id} role={m.role} email={m.email} />
                ) : (
                  <span className="text-muted-foreground text-xs">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="font-medium">{i.email}</span>
                  <span className="text-muted-foreground block text-xs">
                    Invited {formatDate(i.createdAt)} as {ROLE_LABEL[i.role]?.toLowerCase()} ·
                    waiting for them to accept
                  </span>
                </span>
                {isOwner ? <RevokeButton id={i.id} /> : null}
              </li>
            ))}
          </ul>
          {isOwner ? <InviteForm disabled={seats.left === 0} /> : <LeaveTeamButton />}
        </CardContent>
      </Card>
    </div>
  );
}
