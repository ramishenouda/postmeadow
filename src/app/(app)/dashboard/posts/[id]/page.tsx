import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, count, desc, eq } from "drizzle-orm";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { deliveries, subscribers } from "@/db/schema";
import { env } from "@/env";
import { formatDateTime } from "@/lib/format";
import { getOwnedPost } from "@/lib/posts";
import { deliveryStats } from "@/lib/sending";
import { AutoRefresh } from "./auto-refresh";
import { PostEditor } from "./post-editor";
import { ResumeButton } from "./resume-button";

export const metadata: Metadata = { title: "Post · Newsletter" };

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
  const { user, publication, post } = owned;

  if (post.status === "draft") {
    const [{ active }] = await db
      .select({ active: count() })
      .from(subscribers)
      .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.status, "active")));
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
      />
    );
  }

  const stats = await deliveryStats(post.id);
  const failures =
    stats.failed > 0
      ? await db
          .select({ email: subscribers.email, error: deliveries.error })
          .from(deliveries)
          .innerJoin(subscribers, eq(deliveries.subscriberId, subscribers.id))
          .where(and(eq(deliveries.postId, post.id), eq(deliveries.status, "failed")))
          .orderBy(desc(deliveries.updatedAt))
          .limit(20)
      : [];
  const done = stats.sent + stats.failed;
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
        </div>
        <p className="text-muted-foreground text-sm">
          {post.status === "sending" ? "Sending started" : "Sent"}{" "}
          {formatDateTime(post.publishedAt)}
        </p>
        {post.status === "sent" ? (
          <Link
            href={`/${publication.slug}/p/${post.slug}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View on the web
          </Link>
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
      </div>

      {post.status === "sending" ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          <span>This page updates on its own. If progress stops for several minutes:</span>
          <ResumeButton postId={post.id} />
        </div>
      ) : null}

      {failures.length ? (
        <section className="space-y-2">
          <h2 className="font-medium">Recent failures</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {failures.map((f, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-medium">{f.email}</span>
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
