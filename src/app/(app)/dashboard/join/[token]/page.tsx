import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { findTeamInvite, TEAM_ROLES, isTeamRole } from "@/lib/team";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Join a team", robots: { index: false } };

type Props = PageProps<"/dashboard/join/[token]">;

/** Where a team invitation email leads (after signing in). */
export default function JoinPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-md py-12">
      <Suspense fallback={<div className="bg-muted h-48 animate-pulse rounded-xl" />}>
        <Join params={params} />
      </Suspense>
    </div>
  );
}

async function Join({ params }: Pick<Props, "params">) {
  const { token } = await params;
  const me = await requireUser();
  const invite = await findTeamInvite(token);
  if (!invite) {
    return (
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">This invitation isn&apos;t valid</h1>
        <p className="text-muted-foreground">It was withdrawn or has already been used.</p>
      </div>
    );
  }
  const role = isTeamRole(invite.role) ? invite.role : "contributor";
  return (
    <div className="space-y-5 rounded-2xl border p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{`Join ${invite.publicationName}`}</h1>
        <p className="text-muted-foreground text-sm">{TEAM_ROLES[role]}.</p>
        <p className="text-muted-foreground text-sm">{`Signed in as ${me.email}.`}</p>
      </div>
      <AcceptButton token={token} />
    </div>
  );
}
