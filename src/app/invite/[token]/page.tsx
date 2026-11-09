import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Brand, Logo, Monogram } from "@/components/brand";
import { Mark } from "@/components/marketing/site-chrome";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { formatDate } from "@/lib/format";
import { findInvitation, type Invitation } from "@/lib/invitations";
import { expiresAt, subscriberState } from "@/lib/subscribers";
import { respondToInvitation } from "./actions";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/invite/[token]">;

/**
 * Where an invitation email's buttons lead. Opening it changes nothing; the reader
 * answers with the buttons here.
 */
export default function InvitationPage({ params, searchParams }: Props) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense
        fallback={<div className="bg-muted mx-auto my-24 h-80 w-full max-w-md rounded-2xl" />}
      >
        <InvitationView params={params} searchParams={searchParams} />
      </Suspense>
      <footer className="text-muted-foreground py-8 text-center text-xs">
        <Link href="/" className="hover:text-foreground inline-flex items-center gap-1.5">
          <Mark className="size-4" /> Sent with {APP_NAME}
        </Link>
      </footer>
    </main>
  );
}

async function InvitationView({ params, searchParams }: Props) {
  const { token } = await params;
  const { answer } = await searchParams;
  const invitation = await findInvitation(token);

  if (!invitation) {
    return (
      <Card>
        <Title>This invitation link doesn&apos;t work</Title>
        <Body>It may be incomplete. Try opening the link from the email again.</Body>
      </Card>
    );
  }

  const p = invitation.publication;
  const state = subscriberState(invitation);
  const archive = (label: string) => (
    <Link
      href={`/${p.slug}`}
      className="text-sm font-medium text-(--accent) underline underline-offset-4"
    >
      {label}
    </Link>
  );

  return (
    <Brand publication={p}>
      <Card publication={p}>
        {state === "invited" ? (
          <Question invitation={invitation} token={token} declining={answer === "no"} />
        ) : state === "active" ? (
          <>
            <Title>You&apos;re subscribed to {p.name}</Title>
            <Body>New issues will arrive at {invitation.email}. Unsubscribe any time.</Body>
            {archive("Read the archive")}
          </>
        ) : state === "declined" ? (
          <>
            <Title>No problem</Title>
            <Body>
              You won&apos;t get emails from {p.name}, and they can&apos;t invite you again. Changed
              your mind? You can still subscribe yourself.
            </Body>
            {archive(`Visit ${p.name}`)}
          </>
        ) : state === "expired" ? (
          <>
            <Title>This invitation has expired</Title>
            <Body>
              It was valid until {formatDate(expiresAt(invitation.confirmSentAt))}. You&apos;re not
              subscribed. If you&apos;d still like {p.name}, you can subscribe on their page.
            </Body>
            {archive(`Subscribe to ${p.name}`)}
          </>
        ) : (
          <>
            <Title>You&apos;re not subscribed to {p.name}</Title>
            <Body>This invitation can&apos;t be used anymore.</Body>
            {archive(`Visit ${p.name}`)}
          </>
        )}
      </Card>
    </Brand>
  );
}

function Question({
  invitation,
  token,
  declining,
}: {
  invitation: Invitation;
  token: string;
  declining: boolean;
}) {
  const p = invitation.publication;
  const accept = (
    <form action={respondToInvitation.bind(null, token, "accept")}>
      <Button
        type="submit"
        size="lg"
        variant={declining ? "outline" : "default"}
        className={declining ? "w-full" : "w-full bg-(--accent) text-white hover:bg-(--accent)/90"}
      >
        {declining ? "Actually, subscribe me" : "Yes, subscribe me"}
      </Button>
    </form>
  );
  const decline = (
    <form action={respondToInvitation.bind(null, token, "decline")}>
      <Button type="submit" size="lg" variant={declining ? "default" : "ghost"} className="w-full">
        No thanks
      </Button>
    </form>
  );
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {p.fromName === p.name ? "You're invited" : `${p.fromName} invited you`}
      </p>
      <Title>{declining ? `Don't want ${p.name}?` : `Subscribe to ${p.name}?`}</Title>
      {p.description ? <Body>{p.description}</Body> : null}
      <Body>
        {declining
          ? `Confirm and you won't get any emails from ${p.name}. They won't be able to invite you again.`
          : `Issues will arrive at ${invitation.email}. You can unsubscribe at any time.`}
      </Body>
      <div className="w-full space-y-2 pt-2">
        {declining ? (
          <>
            {decline}
            {accept}
          </>
        ) : (
          <>
            {accept}
            {decline}
          </>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Not answering is fine too: the invitation expires on{" "}
        {formatDate(expiresAt(invitation.confirmSentAt))}.
      </p>
    </>
  );
}

function Card({
  publication,
  children,
}: {
  publication?: Invitation["publication"];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-(--accent)/5 px-4 py-16">
      <div className="bg-card flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border p-8 text-center shadow-xl shadow-black/5">
        {publication ? (
          publication.logoUrl ? (
            <Logo publication={publication} className="h-12" />
          ) : (
            <Monogram name={publication.name} />
          )
        ) : null}
        {children}
      </div>
    </div>
  );
}

const Title = ({ children }: { children: ReactNode }) => (
  <h1 className="text-2xl font-semibold tracking-tight text-balance">{children}</h1>
);

const Body = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground text-pretty">{children}</p>
);
