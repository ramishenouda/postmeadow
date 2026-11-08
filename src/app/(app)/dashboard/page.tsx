import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { deliveries, posts, subscribers } from "@/db/schema";
import { env } from "@/env";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createPost } from "./posts/actions";

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

  const countSubscribers = (status: "active" | "pending") =>
    db
      .select({ n: count() })
      .from(subscribers)
      .where(and(eq(subscribers.publicationId, publication.id), eq(subscribers.status, status)));

  const [[active], [pending], [sentPosts], recent] = await Promise.all([
    countSubscribers("active"),
    countSubscribers("pending"),
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
        updatedAt: posts.updatedAt,
        delivered: sql<number>`(select count(*)::int from ${deliveries} d where d.post_id = posts.id and d.status = 'sent')`,
      })
      .from(posts)
      .where(eq(posts.publicationId, publication.id))
      .orderBy(desc(posts.updatedAt))
      .limit(5),
  ]);

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
          <h1 className="text-2xl font-semibold tracking-tight">{publication.name}</h1>
          <Link
            href={`/${publication.slug}`}
            className="text-muted-foreground text-sm hover:underline"
          >
            {publicUrl.host}
            {publicUrl.pathname} ↗
          </Link>
        </div>
        <form action={createPost}>
          <Button type="submit">New post</Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Subscribers" value={active.n} href="/dashboard/subscribers?status=active" />
        <Stat
          label="Awaiting confirmation"
          value={pending.n}
          href="/dashboard/subscribers?status=pending"
        />
        <Stat label="Posts sent" value={sentPosts.n} href="/dashboard/posts" />
      </div>

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
    <Link href={href} className="hover:bg-muted/40 rounded-xl transition-colors">
      <Card className="bg-transparent">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{value.toLocaleString("en")}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="bg-muted h-12 w-72 animate-pulse rounded" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-muted h-28 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-muted h-48 animate-pulse rounded-xl" />
    </div>
  );
}
