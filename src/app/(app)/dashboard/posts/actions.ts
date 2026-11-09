"use server";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  comments,
  deliveries,
  postAudienceTags,
  posts,
  postTemplates,
  subscribers,
  tags,
} from "@/db/schema";
import { addAuthorComment } from "@/lib/comments";
import { publicationTag } from "@/lib/cache-tags";
import { requirePublication } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import { getOwnedPost } from "@/lib/posts";
import {
  AB_TEST_PERCENTS,
  AB_WAIT_HOURS,
  decideAbTest,
  processDeliveries,
  queuePost,
  sendTestEmail,
} from "@/lib/sending";
import { sponsorInput, type SponsorInput } from "@/lib/sponsor";
import { SLUG_PATTERN } from "@/lib/slug";
import { randomToken } from "@/lib/tokens";
import { env } from "@/env";
import { isEmailDesign } from "@/lib/email-designs";
import { starterContent, starterTemplate } from "@/lib/post-templates";
import { countAudience, receiving } from "@/lib/tags";
import { paidAccessSql } from "@/lib/paid";
import { reportError } from "@/lib/report";

const EDITORS_ONLY = "Only an editor or the owner can do that. Ask them to send it.";
const isEditor = (role: string) => role === "owner" || role === "editor";

const untitledSlug = () =>
  `untitled-${randomToken()
    .slice(0, 6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x")}`;

/** A blank draft. */
export async function createPost() {
  return createPostFrom("blank");
}

/**
 * Start a draft from "blank", a starter template ("starter:<id>") or one of this
 * publication's saved templates ("saved:<uuid>").
 */
export async function createPostFrom(source: string) {
  const { user, publication } = await requirePublication();
  let start = {
    title: "",
    subtitle: null as string | null,
    content: "",
    contentFormat: "markdown",
    emailDesign: null as string | null,
  };

  if (source.startsWith("starter:")) {
    const template = starterTemplate(source.slice("starter:".length));
    if (template) {
      start = {
        ...start,
        title: template.title,
        subtitle: template.subtitle || null,
        content: starterContent(template, env.APP_URL),
        // A template made for a design brings it along (the writer can switch back).
        emailDesign: template.design ?? null,
      };
    }
  } else if (source.startsWith("saved:")) {
    const id = source.slice("saved:".length);
    const [template] = /^[0-9a-f-]{36}$/i.test(id)
      ? await db
          .select()
          .from(postTemplates)
          .where(and(eq(postTemplates.id, id), eq(postTemplates.publicationId, publication.id)))
      : [];
    if (template) {
      start = {
        title: template.title,
        subtitle: template.subtitle,
        content: template.content,
        contentFormat: template.contentFormat,
        emailDesign: template.emailDesign,
      };
    }
  }

  const [post] = await db
    .insert(posts)
    .values({ publicationId: publication.id, slug: untitledSlug(), authorId: user.id, ...start })
    .returning({ id: posts.id });
  redirect(`/dashboard/posts/${post.id}`);
}

const MAX_TEMPLATES = 50;

/** Save a post's title, subtitle and content as a reusable template. */
export async function saveAsTemplate(postId: string, name: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) return { ok: false, error: "Give the template a name." };

  const [{ n }] = await db
    .select({ n: count() })
    .from(postTemplates)
    .where(eq(postTemplates.publicationId, owned.publication.id));
  if (n >= MAX_TEMPLATES) {
    return { ok: false, error: `You can keep up to ${MAX_TEMPLATES} templates. Delete one first.` };
  }

  const { post } = owned;
  await db.insert(postTemplates).values({
    publicationId: owned.publication.id,
    name: cleanName,
    title: post.title,
    subtitle: post.subtitle,
    content: post.content,
    contentFormat: post.contentFormat,
    emailDesign: post.emailDesign,
  });
  return { ok: true, message: `Saved as template “${cleanName}”. Find it under New post.` };
}

/**
 * Who a post goes to: everyone, or active subscribers with any of these tags.
 * Returns how many that is right now.
 */
export async function setPostAudience(
  postId: string,
  mode: "everyone" | "tags" | "paid",
  tagIds: string[],
): Promise<{ ok: true; recipients: number } | { ok: false; error: string }> {
  if (mode !== "everyone" && mode !== "tags" && mode !== "paid") {
    return { ok: false, error: "Pick who it goes to." };
  }
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned) return { ok: false, error: "Post not found." };
  if (owned.post.status !== "draft" && owned.post.status !== "scheduled") {
    return { ok: false, error: "This post has already been sent." };
  }
  const publicationId = owned.publication.id;
  // Only this publication's tags.
  const valid =
    mode === "tags" && tagIds.length > 0
      ? (
          await db
            .select({ id: tags.id })
            .from(tags)
            .where(
              and(
                eq(tags.publicationId, publicationId),
                inArray(tags.id, tagIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)),
              ),
            )
        ).map((t) => t.id)
      : [];

  await db.transaction(async (tx) => {
    await tx.update(posts).set({ audience: mode }).where(eq(posts.id, owned.post.id));
    await tx.delete(postAudienceTags).where(eq(postAudienceTags.postId, owned.post.id));
    if (valid.length) {
      await tx
        .insert(postAudienceTags)
        .values(valid.map((tagId) => ({ postId: owned.post.id, tagId })));
    }
  });
  return {
    ok: true,
    recipients:
      mode === "paid"
        ? await countPaid(publicationId)
        : await countAudience(publicationId, mode === "tags" ? valid : null),
  };
}

/** Paying, active and not paused subscribers. */
async function countPaid(publicationId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(subscribers)
    .where(and(eq(subscribers.publicationId, publicationId), receiving(), paidAccessSql));
  return n;
}

/** Make a post paid (free readers get a preview) or free. Before sending only. */
export async function setPostPaid(postId: string, paid: boolean): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  if (owned.post.status !== "draft" && owned.post.status !== "scheduled") {
    return { ok: false, error: "This post has already been sent." };
  }
  await db.update(posts).set({ paid }).where(eq(posts.id, owned.post.id));
  return {
    ok: true,
    message: paid
      ? "Paid post: free readers get the beginning and an upgrade button."
      : "Free post: everyone gets all of it.",
  };
}

/** Give one post its own email design, or (null) go back to the publication's. */
export async function setPostDesign(postId: string, design: string | null): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  if (design !== null && !isEmailDesign(design)) return { ok: false, error: "Unknown design." };
  if (owned.post.status === "sent" || owned.post.status === "sending") {
    return { ok: false, error: "This post has already been sent." };
  }
  await db
    .update(posts)
    .set({ emailDesign: design, updatedAt: new Date() })
    .where(eq(posts.id, owned.post.id));
  return { ok: true, message: "Design updated." };
}

export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  const { publication } = await requirePublication();
  if (!/^[0-9a-f-]{36}$/i.test(templateId)) return { ok: false, error: "Template not found." };
  const deleted = await db
    .delete(postTemplates)
    .where(and(eq(postTemplates.id, templateId), eq(postTemplates.publicationId, publication.id)))
    .returning({ id: postTemplates.id });
  if (deleted.length === 0) return { ok: false, error: "Template not found." };
  refresh();
  return { ok: true, message: "Template deleted." };
}

const postInput = z.object({
  title: z.string().trim().max(200),
  subtitle: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "3–40 characters: lowercase letters, numbers and dashes"),
  content: z.string().max(200_000, "That post is too long"),
});

export type PostInput = z.input<typeof postInput>;
export type SaveResult =
  { ok: true; savedAt: string } | { ok: false; error: string; field?: keyof PostInput };

export async function savePost(postId: string, input: PostInput): Promise<SaveResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  const { post, publication } = owned;
  if (post.status === "sending") {
    return { ok: false, error: "This post is being sent; edit it once sending finishes." };
  }
  if (post.status === "sent" && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };

  const parsed = postInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: issue.path[0] as keyof PostInput };
  }

  try {
    if (post.status === "sent") {
      // Only the web version changes; emails already went out. The address stays
      // the same so links in those emails keep working.
      await db
        .update(posts)
        .set({
          title: parsed.data.title,
          subtitle: parsed.data.subtitle,
          content: parsed.data.content,
        })
        .where(and(eq(posts.id, postId), eq(posts.status, "sent")));
      updateTag(publicationTag(publication.slug));
    } else {
      await db
        .update(posts)
        .set(parsed.data)
        .where(and(eq(posts.id, postId), inArray(posts.status, ["draft", "scheduled"])));
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Another post already uses this URL.", field: "slug" };
    }
    throw error;
  }
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deletePost(postId: string) {
  const owned = await getOwnedPost(postId);
  if (owned?.post.status === "draft" && owned.post.kind === "issue") {
    await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.status, "draft")));
  }
  redirect("/dashboard/posts");
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function sendTest(postId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  if (!owned.post.title.trim()) return { ok: false, error: "Add a title first." };
  try {
    await sendTestEmail(owned.post, owned.publication, owned.user.email);
  } catch (error) {
    reportError("sendTest failed", error);
    return { ok: false, error: "The test email couldn't be sent. Check the email settings." };
  }
  return { ok: true, message: `Test sent to ${owned.user.email}` };
}

function notReadyToSend(post: {
  title: string;
  content: string;
  slug: string;
  kind: string;
}): string | null {
  if (post.kind !== "issue") return "Automation emails are sent by their automation.";
  if (!post.title.trim()) return "Add a title before sending.";
  if (!post.content.trim()) return "Write something before sending.";
  if (post.slug.startsWith("untitled-")) return "Set the post URL before sending.";
  return null;
}

const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Schedule (or reschedule) a post. The scheduler sends it at `at` to everyone who's
 * subscribed by then, and publishes it on the web. Scheduled posts stay editable.
 */
export async function schedulePost(
  postId: string,
  at: string,
  ab: AbTestInput | null = null,
): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned) return { ok: false, error: "Post not found." };
  const { post } = owned;
  if (post.status !== "draft" && post.status !== "scheduled") {
    return { ok: false, error: "This post has already been sent." };
  }
  const abError = await saveAbTest(post.id, ab);
  if (abError) return { ok: false, error: abError };
  const blocker = notReadyToSend(post);
  if (blocker) return { ok: false, error: blocker.replace("sending", "scheduling") };
  // Problems that would stop it at send time anyway (limits are checked then too).
  if (owned.publication.suspendedAt) {
    return { ok: false, error: "Sending is paused on this account." };
  }
  if (!owned.publication.postalAddress?.trim()) {
    return {
      ok: false,
      error: "Add your postal address in Settings first. It appears in every email's footer.",
    };
  }

  const when = new Date(at);
  const ahead = when.getTime() - Date.now();
  if (Number.isNaN(ahead)) return { ok: false, error: "Pick a date and time." };
  if (ahead < MIN_SCHEDULE_AHEAD_MS) return { ok: false, error: "Pick a time in the future." };
  if (ahead > MAX_SCHEDULE_AHEAD_MS) return { ok: false, error: "Schedule at most a year ahead." };

  await db
    .update(posts)
    .set({ status: "scheduled", scheduledAt: when, sendError: null })
    .where(and(eq(posts.id, postId), inArray(posts.status, ["draft", "scheduled"])));
  refresh();
  return { ok: true, message: "Scheduled." };
}

export async function unschedulePost(postId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned || owned.post.status !== "scheduled") {
    return { ok: false, error: "This post isn't scheduled." };
  }
  await db
    .update(posts)
    .set({ status: "draft", scheduledAt: null })
    .where(and(eq(posts.id, postId), eq(posts.status, "scheduled")));
  refresh();
  return { ok: true, message: "Back to draft." };
}

/** Take a sent post off the web (archive, post page, feed, sitemap), or put it back. */
export async function setWebHidden(postId: string, hidden: boolean): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned || owned.post.status !== "sent") return { ok: false, error: "Post not found." };
  await db
    .update(posts)
    .set({ webHidden: hidden })
    .where(and(eq(posts.id, postId), eq(posts.status, "sent")));
  updateTag(publicationTag(owned.publication.slug));
  refresh();
  return { ok: true, message: hidden ? "Removed from the web." : "Published on the web again." };
}

export async function sendPost(
  postId: string,
  ab: AbTestInput | null = null,
): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned) return { ok: false, error: "Post not found." };
  const { post, publication } = owned;
  if (post.status !== "draft" && post.status !== "scheduled") {
    return { ok: false, error: "This post has already been sent." };
  }
  const blocker = notReadyToSend(post);
  if (blocker) return { ok: false, error: blocker };
  const abError = await saveAbTest(post.id, ab);
  if (abError) return { ok: false, error: abError };

  // Suspension, postal address, audience and plan limits are all checked in queuePost.
  const result = await queuePost(post.id, publication.id);
  if (result === null) return { ok: false, error: "This post has already been sent." };
  if ("blocked" in result) return { ok: false, error: result.blocked };

  // Respond right away; the batches go out after the response.
  after(() =>
    processDeliveries(post.id).catch((e) => reportError("send failed", e, { postId: post.id })),
  );
  refresh();
  return {
    ok: true,
    message: ab
      ? `A/B test started: ${result.queued.toLocaleString("en")} subscribers in total.`
      : `Sending to ${result.queued.toLocaleString("en")} subscribers…`,
  };
}

const abTestInput = z.object({
  subjectB: z.string().trim().min(1, "Write the second subject line.").max(200),
  metric: z.enum(["opens", "clicks"]),
  percent: z.number().refine((n) => (AB_TEST_PERCENTS as readonly number[]).includes(n)),
  waitHours: z.number().refine((n) => (AB_WAIT_HOURS as readonly number[]).includes(n)),
});

export type AbTestInput = z.input<typeof abTestInput>;

/** Stores (or clears, with null) a post's A/B subject test. Returns an error message. */
async function saveAbTest(postId: string, ab: AbTestInput | null): Promise<string | null> {
  if (ab === null) {
    await db.update(posts).set({ abMetric: null }).where(eq(posts.id, postId));
    return null;
  }
  const parsed = abTestInput.safeParse(ab);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the A/B test settings.";
  const { subjectB, metric, percent, waitHours } = parsed.data;
  await db
    .update(posts)
    .set({ subjectB, abMetric: metric, abTestPercent: percent, abWaitHours: waitHours })
    .where(eq(posts.id, postId));
  return null;
}

/** Ends an A/B test early with the writer's pick, and sends it to everyone else. */
export async function pickAbWinner(postId: string, variant: "a" | "b"): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned || owned.post.status !== "sending" || !owned.post.abMetric) {
    return { ok: false, error: "There's no A/B test running on this post." };
  }
  if (variant !== "a" && variant !== "b") return { ok: false, error: "Pick A or B." };
  const winner = await decideAbTest(postId, variant);
  if (!winner) return { ok: false, error: "The test has already been decided." };
  after(() =>
    processDeliveries(postId).catch((e) => reportError("A/B send failed", e, { postId })),
  );
  refresh();
  return { ok: true, message: `Sending subject ${winner.toUpperCase()} to everyone else…` };
}

/** People who got a sent post but haven't opened or clicked it (and are still subscribed). */
async function nonOpeners(postId: string) {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from ${deliveries} d
    join subscribers s on s.id = d.subscriber_id
    where d.post_id = ${postId} and d.status = 'sent'
      and d.opened_at is null and d.clicked_at is null and s.status = 'active'
  `);
  return rows[0]?.n ?? 0;
}

/**
 * Sends a sent post again, with a new subject line, to the people who didn't open it.
 * Once per post. The resend is a hidden copy linked to the original (posts.resendOf),
 * so its numbers are separate and "view in browser" opens the original.
 */
export async function resendToNonOpeners(postId: string, subject: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned) return { ok: false, error: "Post not found." };
  const { post, publication } = owned;
  if (post.status !== "sent" || post.resendOf) {
    return { ok: false, error: "Only a sent post can be resent." };
  }
  const cleanSubject = subject.trim().slice(0, 200);
  if (!cleanSubject) return { ok: false, error: "Write a subject line for the resend." };
  const [existing] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.resendOf, post.id))
    .limit(1);
  if (existing) return { ok: false, error: "This post has already been resent once." };
  if ((await nonOpeners(post.id)) === 0) {
    return { ok: false, error: "Everyone who got it has opened it (or left)." };
  }

  const [copy] = await db
    .insert(posts)
    .values({
      publicationId: publication.id,
      title: cleanSubject,
      subtitle: post.subtitle,
      slug: `resend-${randomToken()
        .slice(0, 10)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "x")}`,
      content: post.content,
      contentFormat: post.contentFormat,
      emailDesign: post.emailDesign,
      sponsor: post.sponsor,
      webHidden: true,
      resendOf: post.id,
    })
    .returning({ id: posts.id });
  const result = await queuePost(copy.id, publication.id);
  if (result === null || "blocked" in result) {
    await db.delete(posts).where(and(eq(posts.id, copy.id), eq(posts.status, "draft")));
    return { ok: false, error: result ? result.blocked : "Couldn't start the resend." };
  }
  after(() =>
    processDeliveries(copy.id).catch((e) => reportError("resend failed", e, { postId: copy.id })),
  );
  refresh();
  return {
    ok: true,
    message: `Resending to ${result.queued.toLocaleString("en")} people who didn't open it…`,
  };
}

/** Sets (or, with null, removes) the sponsor placement of a draft or scheduled post. */
export async function setPostSponsor(
  postId: string,
  input: SponsorInput | null,
): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned) return { ok: false, error: "Post not found." };
  if (owned.post.status !== "draft" && owned.post.status !== "scheduled") {
    return { ok: false, error: "This post has already been sent." };
  }
  if (input === null) {
    await db.update(posts).set({ sponsor: null }).where(eq(posts.id, owned.post.id));
    return { ok: true, message: "Sponsor removed." };
  }
  const parsed = sponsorInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the sponsor." };
  await db
    .update(posts)
    .set({
      sponsor: parsed.data,
      sponsorReportToken: owned.post.sponsorReportToken ?? randomToken(),
    })
    .where(eq(posts.id, owned.post.id));
  return { ok: true, message: `Sponsor “${parsed.data.name}” added.` };
}

/** Restarts a send that stopped part-way (e.g. the server restarted). */
export async function resumeSend(postId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (!owned || owned.post.status !== "sending") return { ok: false, error: "Nothing to resume." };
  after(() => processDeliveries(postId).catch((e) => reportError("resume failed", e, { postId })));
  refresh();
  return { ok: true, message: "Resumed." };
}

/** Delete a comment on one of this publication's posts. */
export async function deleteComment(postId: string, commentId: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned || !/^[0-9a-f-]{36}$/i.test(commentId)) return { ok: false, error: "Not found." };
  await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.postId, owned.post.id)));
  refresh();
  return { ok: true, message: "Comment deleted." };
}

/** Reply under a post as its author (shown with an "Author" badge). */
export async function replyAsAuthor(postId: string, body: string): Promise<ActionResult> {
  const owned = await getOwnedPost(postId);
  if (owned && !isEditor(owned.role)) return { ok: false, error: EDITORS_ONLY };
  if (!owned || owned.post.status !== "sent") return { ok: false, error: "Post not found." };
  const error = await addAuthorComment(
    owned.post.id,
    owned.publication.fromName,
    owned.user.email,
    body,
  );
  if (error) return { ok: false, error };
  refresh();
  return { ok: true, message: "Reply posted." };
}
