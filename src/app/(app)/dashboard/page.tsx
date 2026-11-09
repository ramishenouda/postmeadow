import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { StatusBadge } from "@/components/status-badge";
import { SubscriberChart } from "@/components/subscriber-chart";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { deliveries, posts, subscribers } from "@/db/schema";
import { env } from "@/env";
import { requirePublication } from "@/lib/dal";
import { formatDate, formatDateTime } from "@/lib/format";
import { subscriberGrowth } from "@/lib/growth";
import { accountUsage, nearLimit, type AccountUsage } from "@/lib/limits";
import { subscriberStateWhere } from "@/lib/subscribers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { publication } = await requirePublication();

  const countSubscribers = (where: SQL) =>
    db
      .select({ n: count() })
      .from(subscribers)
      .where(and(eq(subscribers.publicationId, publication.id), where));

  const [[active], [pending], [sentPosts], recent, growth, usage] = await Promise.all([
    countSubscribers(subscriberStateWhere("active")),
    // Still able to answer: invited, or signed up and not yet confirmed (not expired).
    countSubscribers(
      or(subscriberStateWhere("invited"), subscriberStateWhere("unconfirmed")) as SQL,
    ),
    db
      .select({ n: count() })
      .from(posts)
      .where(and(eq(posts.publicationId, publication.id), eq(posts.status, "sent"))),
    db
      .select({
        id: posts.id,
        title: posts.title,
        status: posts.status,
        publishedAt: posts.publishedAt,
        scheduledAt: posts.scheduledAt,
        updatedAt: posts.updatedAt,
        delivered: sql<number>`(select count(*)::int from ${deliveries} d where d.post_id = posts.id and d.status = 'sent')`,
      })
      .from(posts)
      .where(eq(posts.publicationId, publication.id))
      .orderBy(desc(posts.updatedAt))
      .limit(5),
    subscriberGrowth(publication.id, 30),
    accountUsage(publication.ownerId),
  ]);
  const gained = growth.reduce((n, d) => n + d.gained, 0);
  const lost = growth.reduce((n, d) => n + d.lost, 0);

  const publicUrl = new URL(`/${publication.slug}`, env.APP_URL);
  const steps = [
    {
      done: active.n > 0,
      title: "Get your first subscriber",
      body: (
        <>
          Share{" "}
          <Link href={`/${publication.slug}`} className="underline">
            your page
          </Link>{" "}
          or{" "}
          <Link href="/dashboard/subscribers" className="underline">
            add people yourself
          </Link>
          .
        </>
      ),
    },
    {
      done: recent.length > 0,
      title: "Write your first post",
      body: <>Draft in Markdown and watch the email preview update as you type.</>,
    },
    {
      done: sentPosts.n > 0,
      title: "Send it",
      body: <>Send yourself a test first, then send it to everyone.</>,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{publication.name}</h1>
          <Link
            href={`/${publication.slug}`}
            className="text-muted-foreground text-sm hover:underline"
          >
            {publicUrl.host}
            {publicUrl.pathname} ↗
          </Link>
        </div>
        <Link href="/dashboard/posts/new" className={buttonVariants()}>
          New post
        </Link>
      </div>

      <AccountNotices
        suspended={publication.suspendedAt !== null}
        suspendedReason={publication.suspendedReason}
        missingAddress={!publication.postalAddress?.trim()}
        usage={usage}
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat label="Subscribers" value={active.n} href="/dashboard/subscribers?status=active" />
        <Stat
          label="Awaiting an answer"
          value={pending.n}
          href="/dashboard/subscribers?status=waiting"
        />
        <Stat label="Posts sent" value={sentPosts.n} href="/dashboard/posts" />
      </div>

      {gained + lost > 0 || active.n > 0 ? (
        <section className="space-y-3 rounded-xl border p-5" aria-labelledby="growth-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="growth-heading" className="font-medium">
              Subscribers, last 30 days
            </h2>
            <p className="text-muted-foreground text-sm tabular-nums">
              +{gained.toLocaleString("en")} new · −{lost.toLocaleString("en")} left
            </p>
          </div>
          <SubscriberChart data={growth} />
        </section>
      ) : null}

      {steps.some((s) => !s.done) ? (
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="font-medium">Getting started</h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                    step.done ? "bg-foreground text-background" : "text-muted-foreground border",
                  )}
                  aria-hidden
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="text-sm">
                  <p
                    className={cn("font-medium", step.done && "text-muted-foreground line-through")}
                  >
                    {step.title}
                  </p>
                  {!step.done ? <p className="text-muted-foreground">{step.body}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent posts</h2>
          <Link href="/dashboard/posts" className="text-muted-foreground text-sm hover:underline">
            All posts
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Nothing here yet.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {recent.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/dashboard/posts/${post.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{post.title || "Untitled"}</p>
                    <p className="text-muted-foreground text-xs">
                      {post.status === "draft"
                        ? `Edited ${formatDate(post.updatedAt)}`
                        : post.status === "scheduled"
                          ? `Scheduled for ${formatDateTime(post.scheduledAt)}`
                          : `${formatDate(post.publishedAt)} · ${post.delivered.toLocaleString("en")} delivered`}
                    </p>
                  </div>
                  <StatusBadge status={post.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-card hover:border-primary/30 rounded-xl border p-3 transition-colors hover:shadow-sm sm:p-5"
    >
      <p className="text-muted-foreground text-xs sm:text-sm">{label}</p>
      <p className="font-display mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
        {value.toLocaleString("en")}
      </p>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="bg-muted h-12 w-72 animate-pulse rounded" />
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-muted h-20 animate-pulse rounded-xl sm:h-28" />
        ))}
      </div>
      <div className="bg-muted h-48 animate-pulse rounded-xl" />
    </div>
  );
}

/** Things that stop or will soon stop sending, most serious first. */
function AccountNotices({
  suspended,
  suspendedReason,
  missingAddress,
  usage,
}: {
  suspended: boolean;
  suspendedReason: string | null;
  missingAddress: boolean;
  usage: AccountUsage;
}) {
  const limit = nearLimit(usage);
  const notices: { tone: "danger" | "warn"; body: React.ReactNode }[] = [];
  if (suspended) {
    notices.push({
      tone: "danger",
      body: (
        <>
          <strong>Sending is paused on this account.</strong>{" "}
          {suspendedReason ? `${suspendedReason} ` : ""}Reply to any email from us to sort it out.
        </>
      ),
    });
  }
  if (missingAddress) {
    notices.push({
      tone: "warn",
      body: (
        <>
          <strong>Add your postal address before you send.</strong> The law requires one in every
          newsletter.{" "}
          <Link href="/dashboard/settings#postalAddress" className="underline">
            Add it in Settings
          </Link>
          .
        </>
      ),
    });
  }
  if (limit) {
    const fmt = (n: number) => n.toLocaleString("en");
    notices.push({
      tone: limit === "over" ? "danger" : "warn",
      body: (
        <>
          <strong>
            {limit === "over"
              ? `You've reached the ${usage.planName} plan's limit.`
              : `You're close to the ${usage.planName} plan's limit.`}
          </strong>{" "}
          {fmt(usage.subscribers.used)} of {fmt(usage.subscribers.limit)} subscribers,{" "}
          {fmt(usage.emails.used)} of {fmt(usage.emails.limit)} emails this month.{" "}
          <Link href="/dashboard/billing" className="underline">
            See plans
          </Link>
          .
        </>
      ),
    });
  }
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.map((n, i) => (
        <p
          key={i}
          role={n.tone === "danger" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            n.tone === "danger"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-amber-600/20 bg-amber-50 text-amber-900",
          )}
        >
          {n.body}
        </p>
      ))}
    </div>
  );
}
