import "server-only";
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, publications, rateLimits } from "@/db/schema";
import { env } from "@/env";
import { notifyUser } from "@/lib/notify";
import { decideAbTest, isSendRunning, processDeliveries, queuePost } from "@/lib/sending";
import { absoluteUrl } from "@/lib/urls";
import { runAutomations } from "@/lib/automations";
import { reportError } from "@/lib/report";

/**
 * A small in-process job runner, started once per server (src/instrumentation.ts):
 *
 * 1. Sends scheduled posts when they're due. Claiming a post is an atomic status
 *    change (scheduled → sending), so even with several servers each post is sent once.
 * 2. Picks up sends that stopped part-way (a deploy or restart). Delivery is already
 *    safe against double-sending (rows are claimed with SKIP LOCKED, stale claims
 *    are re-queued), so resuming is always safe.
 *
 * Durable without extra infrastructure: all state lives in Postgres.
 */

let started = false;

export function startScheduler() {
  if (started || env.SCHEDULER_INTERVAL_MS === 0) return;
  started = true;
  const loop = async () => {
    try {
      await tick();
    } catch (error) {
      reportError("scheduler tick failed", error);
    }
    setTimeout(loop, env.SCHEDULER_INTERVAL_MS).unref();
  };
  // A short delay so the server finishes starting first.
  setTimeout(loop, Math.min(5_000, env.SCHEDULER_INTERVAL_MS)).unref();
  console.log(`scheduler: checking every ${env.SCHEDULER_INTERVAL_MS / 1000}s`);
}

/** Rate-limit counters hold IP addresses; the privacy policy promises they go within a day. */
const HOUSEKEEPING_MS = 10 * 60 * 1000;
let lastHousekeeping = 0;

async function housekeeping() {
  if (Date.now() - lastHousekeeping < HOUSEKEEPING_MS) return;
  lastHousekeeping = Date.now();
  await db.execute(sql`delete from ${rateLimits} where window_start < now() - interval '1 day'`);
}

export async function tick() {
  await housekeeping();

  const due = await db
    .select({ id: posts.id, publicationId: posts.publicationId })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())))
    .limit(20);

  for (const post of due) {
    // null: someone else (another server, or "Send now") already took it.
    const result = await queuePost(post.id, post.publicationId);
    if (result === null) continue;
    if ("blocked" in result) {
      await refuseScheduled(post.id, result.blocked);
      continue;
    }
    console.log(`scheduler: sending ${post.id} to ${result.queued} subscribers`);
    void processDeliveries(post.id).catch((e) => reportError("scheduled send failed", e));
  }

  const automated = await runAutomations();
  if (automated) console.log(`scheduler: sent ${automated} automation emails`);

  // A/B tests whose wait is over: pick the winner and send it to everyone else.
  const decided = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.status, "sending"),
        isNotNull(posts.abMetric),
        isNull(posts.abWinner),
        lte(posts.abDecideAt, new Date()),
      ),
    )
    .limit(20);
  for (const post of decided) {
    const winner = await decideAbTest(post.id);
    if (winner) console.log(`scheduler: A/B test ${post.id} won by ${winner.toUpperCase()}`);
  }

  // Sends that were interrupted (e.g. by a restart) and aren't running here,
  // and A/B tests just released to everyone.
  const sending = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.status, "sending"))
    .limit(20);
  for (const post of sending) {
    if (isSendRunning(post.id)) continue;
    void processDeliveries(post.id).catch((e) => reportError("resumed send failed", e));
  }
}

/**
 * A scheduled post that may not go out (over a plan limit, account paused…): back to
 * draft with the reason shown in the editor, and the writer gets an email.
 */
async function refuseScheduled(postId: string, reason: string) {
  const [post] = await db
    .update(posts)
    .set({ status: "draft", scheduledAt: null, sendError: reason })
    .where(and(eq(posts.id, postId), eq(posts.status, "scheduled")))
    .returning({ title: posts.title, publicationId: posts.publicationId });
  if (!post) return;
  console.warn(`scheduler: not sending ${postId}: ${reason}`);
  const [publication] = await db
    .select({ ownerId: publications.ownerId })
    .from(publications)
    .where(eq(publications.id, post.publicationId));
  if (!publication) return;
  await notifyUser(publication.ownerId, `Your scheduled post wasn't sent`, {
    title: "Your scheduled post wasn't sent",
    paragraphs: [`“${post.title || "Untitled"}” was due now, but it couldn't go out.`, reason],
    action: { label: "Open the post", url: absoluteUrl(`/dashboard/posts/${postId}`) },
  });
}
