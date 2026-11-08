import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/db";
import { deliveries, posts } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { formatDate, formatDateTime } from "@/lib/format";
import { createPost } from "./actions";

export const metadata: Metadata = { title: "Posts" };

export default function PostsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
          <p className="text-muted-foreground text-sm">Drafts and everything you&apos;ve sent.</p>
        </div>
        <form action={createPost}>
          <Button type="submit">New post</Button>
        </form>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <PostList />
      </Suspense>
    </div>
  );
}

async function PostList() {
  const { publication } = await requirePublication();
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      scheduledAt: posts.scheduledAt,
      webHidden: posts.webHidden,
      sent: sql<number>`(select count(*)::int from ${deliveries} d where d.post_id = posts.id and d.status = 'sent')`,
      opened: sql<number>`(select count(d.opened_at)::int from ${deliveries} d where d.post_id = posts.id)`,
    })
    .from(posts)
    .where(eq(posts.publicationId, publication.id))
    // Drafts, then scheduled (soonest first), then sent (newest first).
    .orderBy(
      sql`case ${posts.status} when 'draft' then 0 when 'scheduled' then 1 else 2 end`,
      sql`${posts.scheduledAt} asc nulls last`,
      desc(posts.publishedAt),
      desc(posts.updatedAt),
    );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No posts yet</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Write your first issue. You can preview it and send yourself a test before it goes out.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-xl border">
      {rows.map((post) => (
        <li key={post.id}>
          <Link
            href={`/dashboard/posts/${post.id}`}
            className="hover:bg-muted/50 flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate font-medium">{post.title || "Untitled"}</p>
              <p className="text-muted-foreground text-xs">
                {post.status === "draft"
                  ? `Edited ${formatDate(post.updatedAt)}`
                  : post.status === "scheduled"
                    ? `Scheduled for ${formatDateTime(post.scheduledAt)}`
                    : `Sent ${formatDate(post.publishedAt)} · ${post.sent.toLocaleString("en")} delivered` +
                      (post.sent && post.opened
                        ? ` · ${Math.round((post.opened / post.sent) * 100)}% opened`
                        : "")}
              </p>
            </div>
            <span className="flex shrink-0 gap-1.5">
              {post.webHidden ? <StatusBadge status="hidden" /> : null}
              <StatusBadge status={post.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
