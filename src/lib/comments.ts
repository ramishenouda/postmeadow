import "server-only";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commenters, comments, postLikes, posts, publications, subscribers } from "@/db/schema";
import { sendNotice } from "@/lib/notify";
import { hit } from "@/lib/rate-limit";
import { emailSchema } from "@/lib/subscribers";
import { randomToken } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/urls";

/**
 * Likes and comments on web posts.
 *
 * Likes are anonymous: one per browser (a random id in a cookie), rate limited per IP.
 * Comments need an email address that's confirmed once: the first comment waits until
 * the link in the confirmation email is clicked, and that browser is then remembered
 * per publication (commenters.token in a cookie), so later comments appear at once.
 */

export const MAX_COMMENT = 2000;
export const MAX_NAME = 60;
const PER_IP = { limit: 6, windowSeconds: 10 * 60 };
const PER_EMAIL = { limit: 5, windowSeconds: 60 * 60 };
const LIKES_PER_IP = { limit: 100, windowSeconds: 10 * 60 };

/** Cookie holding a remembered commenter's token, per publication. */
export const commenterCookie = (slug: string) => `pmc_${slug}`;
/** Cookie with this browser's random visitor id, for likes. */
export const VISITOR_COOKIE = "pm_v";

/** A sent, visible post on a publication's page, with what the reactions need. */
export async function findWebPost(slug: string, postSlug: string) {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      publicationId: publications.id,
      publicationSlug: publications.slug,
      publicationName: publications.name,
      ownerId: publications.ownerId,
      commentsEnabled: publications.commentsEnabled,
    })
    .from(posts)
    .innerJoin(publications, eq(posts.publicationId, publications.id))
    .where(
      and(
        eq(publications.slug, slug),
        eq(posts.slug, postSlug),
        eq(posts.status, "sent"),
        eq(posts.webHidden, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type PublicComment = {
  id: string;
  name: string;
  body: string;
  byAuthor: boolean;
  bySubscriber: boolean;
  createdAt: Date;
};

/** Published comments, oldest first, marking those from current subscribers. */
export async function listComments(postId: string): Promise<PublicComment[]> {
  const rows = await db
    .select({
      id: comments.id,
      name: comments.name,
      body: comments.body,
      byAuthor: comments.byAuthor,
      createdAt: comments.createdAt,
      bySubscriber: sql<boolean>`exists (
        select 1 from ${subscribers} s join ${posts} p on p.publication_id = s.publication_id
        where p.id = ${comments.postId} and s.email = ${comments.email} and s.status = 'active'
      )`,
    })
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.status, "published")))
    .orderBy(asc(comments.createdAt))
    .limit(500);
  return rows;
}

export async function likeCount(postId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(postLikes)
    .where(eq(postLikes.postId, postId));
  return n;
}

export async function hasLiked(postId: string, visitor: string | undefined) {
  if (!visitor) return false;
  const [row] = await db
    .select({ postId: postLikes.postId })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.visitor, visitor)));
  return Boolean(row);
}

/** Like or unlike. Returns null when rate limited. */
export async function toggleLike(postId: string, visitor: string, ip: string) {
  if (!(await hit(`like:ip:${ip}`, LIKES_PER_IP))) return null;
  const removed = await db
    .delete(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.visitor, visitor)))
    .returning({ postId: postLikes.postId });
  if (removed.length === 0) {
    await db.insert(postLikes).values({ postId, visitor }).onConflictDoNothing();
  }
  return { liked: removed.length === 0, count: await likeCount(postId) };
}

export type CommentResult =
  | { status: "published" }
  | { status: "confirm"; email: string }
  | { status: "error"; message: string };

/** A reader's comment: published at once for a remembered commenter, else confirmed by email. */
export async function createComment(input: {
  post: NonNullable<Awaited<ReturnType<typeof findWebPost>>>;
  name: string;
  email: string;
  body: string;
  commenterToken: string | undefined;
  ip: string;
}): Promise<CommentResult> {
  const { post } = input;
  if (!post.commentsEnabled) return { status: "error", message: "Comments are turned off here." };
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  const body = input.body.replace(/\r\n/g, "\n").trim();
  const email = emailSchema.safeParse(input.email);
  if (!name) return { status: "error", message: "Add your name." };
  if (!email.success) return { status: "error", message: "Enter a valid email address." };
  if (!body) return { status: "error", message: "Write a comment first." };
  if (body.length > MAX_COMMENT) {
    return { status: "error", message: `Keep it under ${MAX_COMMENT} characters.` };
  }
  if (!(await hit(`comment:ip:${input.ip}`, PER_IP))) {
    return { status: "error", message: "Too many comments. Try again in a few minutes." };
  }

  const known = input.commenterToken
    ? await db
        .select({ id: commenters.id })
        .from(commenters)
        .where(
          and(
            eq(commenters.token, input.commenterToken),
            eq(commenters.publicationId, post.publicationId),
            eq(commenters.email, email.data),
          ),
        )
        .then((r) => r[0])
    : undefined;

  if (known) {
    await db.insert(comments).values({
      postId: post.id,
      name,
      email: email.data,
      body,
      status: "published",
    });
    await db.update(commenters).set({ name }).where(eq(commenters.id, known.id));
    return { status: "published" };
  }

  // Someone could type another person's address; don't flood that inbox.
  if (!(await hit(`comment:email:${email.data}`, PER_EMAIL))) {
    return { status: "error", message: "Too many comments. Try again later." };
  }
  const token = randomToken();
  await db.insert(comments).values({
    postId: post.id,
    name,
    email: email.data,
    body,
    status: "pending",
    confirmToken: token,
  });
  await sendNotice(email.data, `Confirm your comment on ${post.publicationName}`, {
    title: "Publish your comment?",
    paragraphs: [
      `You (or someone using your address) commented on “${post.title}”:`,
      body.length > 300 ? `${body.slice(0, 300)}…` : body,
      "Press the button to publish it. Your browser is remembered afterwards, so you won't need to do this again. If this wasn't you, ignore this email and nothing is published.",
    ],
    action: {
      label: "Publish my comment",
      url: absoluteUrl(`/api/comments/confirm?token=${encodeURIComponent(token)}`),
    },
  });
  return { status: "confirm", email: email.data };
}

/** Publishes a pending comment and remembers the commenter. Null for unknown tokens. */
export async function confirmComment(token: string) {
  const [comment] = await db
    .update(comments)
    .set({ status: "published", confirmToken: null })
    .where(and(eq(comments.confirmToken, token), eq(comments.status, "pending")))
    .returning({ postId: comments.postId, email: comments.email, name: comments.name });
  if (!comment) return null;
  const [post] = await db
    .select({
      slug: posts.slug,
      publicationId: posts.publicationId,
      publicationSlug: publications.slug,
      ownerId: publications.ownerId,
      title: posts.title,
    })
    .from(posts)
    .innerJoin(publications, eq(publications.id, posts.publicationId))
    .where(eq(posts.id, comment.postId));
  if (!post) return null;
  const [commenter] = await db
    .insert(commenters)
    .values({
      publicationId: post.publicationId,
      email: comment.email,
      name: comment.name,
      token: randomToken(),
    })
    .onConflictDoUpdate({
      target: [commenters.publicationId, commenters.email],
      set: { name: comment.name },
    })
    .returning({ token: commenters.token });
  return { ...post, commenterToken: commenter.token };
}

/** The writer's own reply, shown with an "Author" badge. */
export async function addAuthorComment(postId: string, name: string, email: string, body: string) {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return "Write a reply first.";
  if (text.length > MAX_COMMENT) return `Keep it under ${MAX_COMMENT} characters.`;
  await db.insert(comments).values({
    postId,
    name: name.slice(0, MAX_NAME),
    email,
    body: text,
    status: "published",
    byAuthor: true,
  });
  return null;
}
