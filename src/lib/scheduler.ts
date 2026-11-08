import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { env } from "@/env";
import { isSendRunning, processDeliveries, queuePost } from "@/lib/sending";

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
      console.error("scheduler tick failed", error);
    }
    setTimeout(loop, env.SCHEDULER_INTERVAL_MS).unref();
  };
  // A short delay so the server finishes starting first.
  setTimeout(loop, Math.min(5_000, env.SCHEDULER_INTERVAL_MS)).unref();
  console.log(`scheduler: checking every ${env.SCHEDULER_INTERVAL_MS / 1000}s`);
}

export async function tick() {
  const due = await db
    .select({ id: posts.id, publicationId: posts.publicationId })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())))
    .limit(20);

  for (const post of due) {
    // null: someone else (another server, or "Send now") already took it.
    const queued = await queuePost(post.id, post.publicationId);
    if (queued !== null) {
      console.log(`scheduler: sending ${post.id} to ${queued} subscribers`);
      void processDeliveries(post.id).catch((e) => console.error("scheduled send failed", e));
    }
  }

  // Sends that were interrupted (e.g. by a restart) and aren't running here.
  const sending = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.status, "sending"))
    .limit(20);
  for (const post of sending) {
    if (isSendRunning(post.id)) continue;
    void processDeliveries(post.id).catch((e) => console.error("resumed send failed", e));
  }
}
