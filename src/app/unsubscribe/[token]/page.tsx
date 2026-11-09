import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { findPreferences, PAUSE_MONTHS } from "@/lib/preferences";
import { managePaid, pause, resume, saveTopics, unsubscribe } from "./actions";
import { hasPaidAccess } from "@/lib/paid";
import { Brand } from "@/components/brand";
import { ReferralCard } from "@/components/referral-card";
import { referralSummary } from "@/lib/referrals";

export const metadata: Metadata = { title: "Your subscription", robots: { index: false } };

type Props = PageProps<"/unsubscribe/[token]">;

const SAVED: Record<string, string> = {
  paused: "Paused. Enjoy the quiet.",
  resumed: "Welcome back. Emails start again with the next issue.",
  topics: "Topics saved.",
};

/**
 * The reader's preferences, from the link in every email's footer. Opening this page
 * never changes anything (mail scanners follow links); the reader presses a button.
 */
export default function PreferencesPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-20">
      <Suspense fallback={<div className="bg-muted mx-auto h-64 animate-pulse rounded-xl" />}>
        <Preferences params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Preferences({ params, searchParams }: Props) {
  const { token } = await params;
  const { saved } = await searchParams;
  const reader = await findPreferences(token);

  if (!reader) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Link not recognised</h1>
        <p className="text-muted-foreground">
          This link is invalid. If you keep getting emails, reply to one and ask to be removed.
        </p>
      </div>
    );
  }

  if (reader.status === "unsubscribed" || reader.status === "bounced") {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re unsubscribed</h1>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">{reader.email}</span> won&apos;t get any
          more emails from {reader.publicationName}.
        </p>
        <Link href={`/${reader.publicationSlug}`} className="inline-block text-sm underline">
          Changed your mind? Subscribe again
        </Link>
      </div>
    );
  }

  const active = reader.status === "active";
  const message = typeof saved === "string" ? SAVED[saved] : undefined;
  const referral =
    active && reader.referralsEnabled
      ? await referralSummary(reader.id, reader.publicationId, reader.publicationSlug)
      : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1 text-center">
        <p className="text-muted-foreground text-sm">{reader.publicationName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Your subscription</h1>
        <p className="text-muted-foreground text-sm">{reader.email}</p>
      </header>

      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-800"
        >
          {message}
        </p>
      ) : null}

      {reader.stripeCustomerId ? (
        <section className="space-y-3 rounded-xl border p-5" aria-labelledby="paid-heading">
          <div>
            <h2 id="paid-heading" className="font-medium">
              Paid subscription
            </h2>
            <p className="text-muted-foreground text-sm">
              {hasPaidAccess(reader)
                ? reader.paidUntil
                  ? `Active. Renews or ends on ${formatDate(reader.paidUntil)}.`
                  : "Active."
                : "Not active."}
            </p>
          </div>
          <form action={managePaid.bind(null, token)}>
            <Button type="submit" variant="outline" size="sm">
              Change card or cancel
            </Button>
          </form>
        </section>
      ) : null}

      {referral ? (
        <Brand
          publication={{
            name: reader.publicationName,
            accentColor: reader.accentColor,
            logoUrl: null,
            fontStyle: "sans",
          }}
        >
          <ReferralCard publicationName={reader.publicationName} summary={referral} />
        </Brand>
      ) : null}

      {active && reader.topics.length ? (
        <section className="space-y-3 rounded-xl border p-5" aria-labelledby="topics-heading">
          <div>
            <h2 id="topics-heading" className="font-medium">
              Topics
            </h2>
            <p className="text-muted-foreground text-sm">
              Some issues go only to readers of a topic. Pick what interests you.
            </p>
          </div>
          <form action={saveTopics.bind(null, token)} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {reader.topics.map((t) => (
                <label
                  key={t.id}
                  className="has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm"
                >
                  <input type="checkbox" name="topic" value={t.id} defaultChecked={t.chosen} />
                  {t.name}
                </label>
              ))}
            </div>
            <Button type="submit" variant="outline" size="sm">
              Save topics
            </Button>
          </form>
        </section>
      ) : null}

      {active ? (
        <section className="space-y-3 rounded-xl border p-5" aria-labelledby="pause-heading">
          <div>
            <h2 id="pause-heading" className="font-medium">
              Take a break
            </h2>
            <p className="text-muted-foreground text-sm">
              {reader.paused && reader.pausedUntil
                ? `Emails are paused until ${formatDate(reader.pausedUntil)}.`
                : "Too much email right now? Pause it and stay subscribed."}
            </p>
          </div>
          {reader.paused ? (
            <form action={resume.bind(null, token)}>
              <Button type="submit" variant="outline" size="sm">
                Start emails again now
              </Button>
            </form>
          ) : (
            <form action={pause.bind(null, token)} className="flex flex-wrap gap-2">
              {PAUSE_MONTHS.map((m) => (
                <Button key={m} type="submit" name="months" value={m} variant="outline" size="sm">
                  Pause {m} {m === 1 ? "month" : "months"}
                </Button>
              ))}
            </form>
          )}
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border p-5" aria-labelledby="unsub-heading">
        <div>
          <h2 id="unsub-heading" className="font-medium">
            Unsubscribe?
          </h2>
          <p className="text-muted-foreground text-sm">
            Stop sending emails from {reader.publicationName} to {reader.email}.
          </p>
        </div>
        <form action={unsubscribe.bind(null, token)}>
          <Button type="submit">Unsubscribe</Button>
        </form>
      </section>
    </div>
  );
}
