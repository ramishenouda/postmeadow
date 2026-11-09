import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { automationSteps, comments, deliveries, postLikes, posts, subscribers } from "@/db/schema";
import { env } from "@/env";
import { formatDateTime } from "@/lib/format";
import { getOwnedPost } from "@/lib/posts";
import { countAudience, listTags, postAudience, receiving } from "@/lib/tags";
import { abResults, AB_MIN_RECIPIENTS, deliveryStats, engagementStats } from "@/lib/sending";
import { readSponsor } from "@/lib/sponsor";
import { acceptsPayments, paidAccessSql } from "@/lib/paid";
import { absoluteUrl } from "@/lib/urls";
import {
  AuthorReplyForm,
  DeleteCommentButton,
  PickWinnerButtons,
  ResendForm,
} from "./post-followups";
import { AutoRefresh } from "./auto-refresh";
import { PostEditor } from "./post-editor";
import { ResumeButton } from "./resume-button";
import { WebVisibilityButton } from "./web-visibility-button";

export const metadata: Metadata = { title: "Post" };

type Props = PageProps<"/dashboard/posts/[id]">;

export default function PostPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="bg-muted h-[70vh] animate-pulse rounded-xl" />}>
      <PostLoader params={params} />
    </Suspense>
  );
}

async function PostLoader({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const owned = await getOwnedPost(id);
  if (!owned) notFound();
  const { user, publication, post, role } = owned;
  const canSend = role !== "contributor";

  if (post.kind === "automation") {
    const [step] = await db
      .select({ automationId: automationSteps.automationId })
      .from(automationSteps)
      .where(eq(automationSteps.postId, post.id));
    return (
      <PostEditor
        mode="automation"
        backHref={step ? `/dashboard/automations/${step.automationId}` : "/dashboard/automations"}
        post={{
          id: post.id,
          title: post.title,
          subtitle: post.subtitle ?? "",
          slug: post.slug,
          content: post.content,
        }}
        urlPrefix=""
        activeSubscribers={0}
        ownerEmail={user.email}
        design={post.emailDesign}
        defaultDesign={publication.emailDesign}
        sponsor={readSponsor(post.sponsor)}
      />
    );
  }

  if (post.status === "draft" || post.status === "scheduled") {
    const [[{ active }], tagList, audience] = await Promise.all([
      db
        .select({ active: count() })
        .from(subscribers)
        .where(and(eq(subscribers.publicationId, publication.id), receiving())),
      listTags(publication.id),
      postAudience(post.id),
    ]);
    const tagIds = audience.tags.map((t) => t.id);
    const paidAvailable = acceptsPayments(publication);
    const [{ paying }] = paidAvailable
      ? await db
          .select({ paying: count() })
          .from(subscribers)
          .where(and(eq(subscribers.publicationId, publication.id), receiving(), paidAccessSql))
      : [{ paying: 0 }];
    const recipients =
      audience.mode === "tags"
        ? await countAudience(publication.id, tagIds)
        : audience.mode === "paid"
          ? paying
          : active;
    return (
      <PostEditor
        post={{
          id: post.id,
          title: post.title,
          subtitle: post.subtitle ?? "",
          slug: post.slug,
          content: post.content,
        }}
        urlPrefix={`${new URL(env.APP_URL).host}/${publication.slug}/p/`}
        activeSubscribers={active}
        ownerEmail={user.email}
        scheduledAt={post.status === "scheduled" ? (post.scheduledAt?.toISOString() ?? null) : null}
        sendError={post.status === "draft" ? post.sendError : null}
        tags={tagList}
        audience={{ mode: audience.mode, tagIds }}
        recipients={recipients}
        design={post.emailDesign}
        defaultDesign={publication.emailDesign}
        sponsor={readSponsor(post.sponsor)}
        abTest={
          post.abMetric && post.subjectB
            ? {
                subjectB: post.subjectB,
                metric: post.abMetric === "clicks" ? "clicks" : "opens",
                percent: post.abTestPercent,
                waitHours: post.abWaitHours,
              }
            : null
        }
        abMinRecipients={AB_MIN_RECIPIENTS}
        canSend={canSend}
        paidAvailable={paidAvailable}
        paid={post.paid}
        paidSubscribers={paying}
      />
    );
  }

  const sponsor = readSponsor(post.sponsor);
  const [stats, engagement, sentTo, ab, followUp, original, sponsorClicks, reactions] =
    await Promise.all([
      deliveryStats(post.id),
      engagementStats(post.id),
      postAudience(post.id),
      post.abMetric ? abResults(post.id) : null,
      resendInfo(post.id, post.resendOf),
      post.resendOf
        ? db
            .select({ id: posts.id, title: posts.title, slug: posts.slug })
            .from(posts)
            .where(eq(posts.id, post.resendOf))
            .then((r) => r[0] ?? null)
        : null,
      sponsor ? sponsorClickCount(post.id, sponsor.url) : 0,
      post.resendOf ? null : postReactions(post.id),
    ]);
  const failures =
    stats.failed + stats.bounced + stats.complained > 0
      ? await db
          .select({ email: subscribers.email, status: deliveries.status, error: deliveries.error })
          .from(deliveries)
          .innerJoin(subscribers, eq(deliveries.subscriberId, subscribers.id))
          .where(
            and(
              eq(deliveries.postId, post.id),
              inArray(deliveries.status, ["failed", "bounced", "complained"]),
            ),
          )
          .orderBy(desc(deliveries.updatedAt))
          .limit(20)
      : [];
  const done = stats.sent + stats.failed + stats.bounced + stats.complained;
  const percent = stats.total ? Math.round((done / stats.total) * 100) : 100;

  return (
    <div className="space-y-8">
      {post.status === "sending" ? <AutoRefresh intervalMs={2000} /> : null}
      <div className="space-y-2">
        <Link href="/dashboard/posts" className="text-muted-foreground text-sm hover:underline">
          ← Posts
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
          <StatusBadge status={post.status} />
          {post.webHidden ? <StatusBadge status="hidden" /> : null}
        </div>
        {original ? (
          <p className="text-sm">
            Resend of{" "}
            <Link href={`/dashboard/posts/${original.id}`} className="font-medium underline">
              {original.title}
            </Link>{" "}
            to the people who didn&apos;t open it.
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {post.status === "sending" ? "Sending started" : "Sent"}{" "}
          {formatDateTime(post.publishedAt)}
          {sentTo.mode === "tags"
            ? ` to subscribers tagged ${sentTo.tags.map((t) => t.name).join(", ") || "(deleted tags)"}`
            : sentTo.mode === "paid"
              ? " to paid subscribers"
              : null}
          {post.paid ? " · Paid post (free readers got a preview)" : null}
          {post.webHidden ? " · Removed from your web archive" : null}
        </p>
        {canSend && post.status === "sent" && !post.resendOf ? (
          <div className="flex flex-wrap gap-2">
            {post.webHidden ? null : (
              <Link
                href={`/${publication.slug}/p/${post.slug}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View on the web
              </Link>
            )}
            <Link
              href={`/dashboard/posts/${post.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit web version
            </Link>
            <WebVisibilityButton postId={post.id} hidden={post.webHidden} />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>
            {done.toLocaleString("en")} of {stats.total.toLocaleString("en")} processed
          </span>
          <span className="text-muted-foreground">{percent}%</span>
        </div>
        <div
          className="bg-muted h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-foreground h-full transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Delivered to provider" value={stats.sent} />
        <Stat label="Failed or skipped" value={stats.failed} />
        <Stat label="Still in queue" value={stats.queued + stats.sending} />
        {stats.held ? <Stat label="Waiting for the A/B winner" value={stats.held} /> : null}
        {stats.bounced ? <Stat label="Bounced" value={stats.bounced} /> : null}
        {stats.complained ? <Stat label="Marked as spam" value={stats.complained} /> : null}
      </div>

      {engagement.delivered > 0 ? (
        <section className="space-y-3" aria-labelledby="engagement-heading">
          <h2 id="engagement-heading" className="font-medium">
            Engagement
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Opened</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{engagement.openRate}%</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {engagement.opened.toLocaleString("en")} of{" "}
                  {engagement.delivered.toLocaleString("en")} readers
                </p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Clicked</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{engagement.clickRate}%</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {engagement.clicked.toLocaleString("en")} of{" "}
                  {engagement.delivered.toLocaleString("en")} readers
                </p>
              </CardHeader>
            </Card>
          </div>
          {engagement.topLinks.length ? (
            <div className="rounded-xl border">
              <h3 className="border-b px-4 py-2 text-sm font-medium">Top links</h3>
              <ul className="divide-y text-sm">
                {engagement.topLinks.map((l) => (
                  <li key={l.url} className="flex items-center justify-between gap-4 px-4 py-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate hover:underline"
                      title={l.url}
                    >
                      {l.url.replace(/^https?:\/\//, "")}
                    </a>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {l.people.toLocaleString("en")} {l.people === 1 ? "reader" : "readers"} ·{" "}
                      {l.clicks.toLocaleString("en")} {l.clicks === 1 ? "click" : "clicks"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Opens are approximate: some mail apps (notably Apple Mail) load images automatically,
            which counts as an open. Clicks are reliable.
          </p>
        </section>
      ) : null}

      {ab ? (
        <section className="space-y-3" aria-labelledby="ab-heading">
          <h2 id="ab-heading" className="font-medium">
            A/B subject test
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["a", "b"] as const).map((v) => {
              const r = ab[v];
              const won = post.abWinner === v;
              return (
                <Card key={v} className={won ? "ring-primary ring-2" : undefined}>
                  <CardHeader>
                    <CardDescription>
                      Subject {v.toUpperCase()}
                      {won ? " · Winner" : ""}
                    </CardDescription>
                    <CardTitle className="text-base leading-snug">
                      {v === "a" ? post.title : post.subjectB}
                    </CardTitle>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {r.delivered.toLocaleString("en")} sent · {r.openRate}% opened · {r.clickRate}
                      % clicked
                    </p>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
          {post.abWinner ? (
            <p className="text-muted-foreground text-sm">
              Subject {post.abWinner.toUpperCase()} went to everyone else
              {post.abDecideAt ? ` on ${formatDateTime(post.abDecideAt)}` : ""}.
            </p>
          ) : post.status === "sending" ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                The subject with more {post.abMetric} goes to everyone else{" "}
                {post.abDecideAt ? `at ${formatDateTime(post.abDecideAt)}` : "soon"}. Or decide now:
              </p>
              {canSend ? <PickWinnerButtons postId={post.id} /> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {sponsor ? (
        <section className="space-y-2" aria-labelledby="sponsor-heading">
          <h2 id="sponsor-heading" className="font-medium">
            Sponsor: {sponsor.name}
          </h2>
          <p className="text-sm">
            <span className="tabular-nums">{sponsorClicks.toLocaleString("en")}</span>{" "}
            {sponsorClicks === 1 ? "reader" : "readers"} clicked the sponsor link
            {engagement.delivered
              ? ` (${Math.round((sponsorClicks / engagement.delivered) * 1000) / 10}% of ${engagement.delivered.toLocaleString("en")})`
              : ""}
            .
          </p>
          {post.sponsorReportToken ? (
            <p className="text-muted-foreground text-sm">
              Results page for the sponsor:{" "}
              <a
                href={`/sponsor/${post.sponsorReportToken}`}
                className="text-foreground break-all underline"
                target="_blank"
              >
                {absoluteUrl(`/sponsor/${post.sponsorReportToken}`)}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}

      {reactions && post.status === "sent" ? (
        <section className="space-y-3" aria-labelledby="comments-heading">
          <h2 id="comments-heading" className="font-medium">
            {`${reactions.likes.toLocaleString("en")} ${reactions.likes === 1 ? "like" : "likes"} · ${reactions.comments.length} ${reactions.comments.length === 1 ? "comment" : "comments"}`}
          </h2>
          {reactions.comments.length ? (
            <ul className="divide-y rounded-xl border text-sm">
              {reactions.comments.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p>
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-muted-foreground text-xs">
                        {c.byAuthor ? "you" : c.email} · {formatDateTime(c.createdAt)}
                      </span>
                    </p>
                    <p className="whitespace-pre-line">{c.body}</p>
                  </div>
                  <DeleteCommentButton postId={post.id} commentId={c.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {publication.commentsEnabled
                ? "No comments yet."
                : "Comments are turned off in Settings."}
            </p>
          )}
          {publication.commentsEnabled && !post.webHidden ? (
            <AuthorReplyForm postId={post.id} />
          ) : null}
        </section>
      ) : null}

      {canSend && post.status === "sent" && !post.resendOf ? (
        <section className="space-y-2" aria-labelledby="resend-heading">
          <h2 id="resend-heading" className="font-medium">
            Resend to people who didn&apos;t open
          </h2>
          {followUp.resend ? (
            <p className="text-sm">
              {`Resent to ${followUp.resend.recipients.toLocaleString("en")} ${
                followUp.resend.recipients === 1 ? "person" : "people"
              } as “${followUp.resend.title}” · `}
              <Link href={`/dashboard/posts/${followUp.resend.id}`} className="underline">
                See its results
              </Link>
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {followUp.nonOpeners.toLocaleString("en")}{" "}
                {followUp.nonOpeners === 1 ? "person hasn't" : "people haven't"} opened it yet. Wait
                a day or two, then send it once more with a new subject line.
              </p>
              <ResendForm postId={post.id} title={post.title} nonOpeners={followUp.nonOpeners} />
            </>
          )}
        </section>
      ) : null}

      {post.status === "sending" ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          <span>This page updates on its own. If progress stops for several minutes:</span>
          <ResumeButton postId={post.id} />
        </div>
      ) : null}

      {failures.length ? (
        <section className="space-y-2">
          <h2 className="font-medium">Problems</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {failures.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="flex items-center gap-2 font-medium">
                  {f.email} <StatusBadge status={f.status} />
                </span>
                <span className="text-muted-foreground">{f.error}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-medium">Content</h2>
        <div className="rounded-xl border p-6">
          {post.subtitle ? (
            <p className="text-muted-foreground mb-4 text-lg">{post.subtitle}</p>
          ) : null}
          <Markdown content={post.content} />
        </div>
      </section>
    </div>
  );
}

/** The resend of a post (if any), or how many people it could go to. */
async function resendInfo(postId: string, resendOf: string | null) {
  if (resendOf) return { resend: null, nonOpeners: 0 };
  const [resend] = await db
    .select({
      id: posts.id,
      title: posts.title,
      recipients: sql<number>`(select count(*)::int from ${deliveries} d where d.post_id = posts.id)`,
    })
    .from(posts)
    .where(eq(posts.resendOf, postId))
    .limit(1);
  if (resend) return { resend, nonOpeners: 0 };
  const [{ n }] = await db
    .select({ n: count() })
    .from(deliveries)
    .innerJoin(subscribers, eq(subscribers.id, deliveries.subscriberId))
    .where(
      and(
        eq(deliveries.postId, postId),
        eq(deliveries.status, "sent"),
        isNull(deliveries.openedAt),
        isNull(deliveries.clickedAt),
        eq(subscribers.status, "active"),
      ),
    );
  return { resend: null, nonOpeners: n };
}

/** Likes and published comments (newest first) on a post's web page. */
async function postReactions(postId: string) {
  const [[{ likes }], list] = await Promise.all([
    db.select({ likes: count() }).from(postLikes).where(eq(postLikes.postId, postId)),
    db
      .select({
        id: comments.id,
        name: comments.name,
        email: comments.email,
        body: comments.body,
        byAuthor: comments.byAuthor,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.postId, postId), eq(comments.status, "published")))
      .orderBy(desc(comments.createdAt))
      .limit(200),
  ]);
  return { likes, comments: list };
}

/** Readers who clicked the sponsor's link in this issue. */
async function sponsorClickCount(postId: string, url: string) {
  const rows = await db.execute<{ n: number }>(sql`
    select count(distinct c.delivery_id)::int as n
    from delivery_link_clicks c join ${deliveries} d on d.id = c.delivery_id
    where d.post_id = ${postId} and c.url = ${url}
  `);
  return rows[0]?.n ?? 0;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value.toLocaleString("en")}</CardTitle>
      </CardHeader>
    </Card>
  );
}
