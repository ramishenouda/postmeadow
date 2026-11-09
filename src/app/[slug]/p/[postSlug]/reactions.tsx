import { cookies } from "next/headers";
import { formatDate } from "@/lib/format";
import {
  commenterCookie,
  findWebPost,
  hasLiked,
  likeCount,
  listComments,
  VISITOR_COOKIE,
} from "@/lib/comments";
import { CommentForm, LikeButton } from "./reactions-client";

/** Likes and comments under a web post. Reads cookies, so render it inside Suspense. */
export async function Reactions({ slug, postSlug }: { slug: string; postSlug: string }) {
  const post = await findWebPost(slug, postSlug);
  if (!post) return null;
  const jar = await cookies();
  const [likes, liked, list] = await Promise.all([
    likeCount(post.id),
    hasLiked(post.id, jar.get(VISITOR_COOKIE)?.value),
    post.commentsEnabled ? listComments(post.id) : Promise.resolve([]),
  ]);
  const remembered = Boolean(jar.get(commenterCookie(post.publicationSlug))?.value);

  return (
    <section id="comments" aria-labelledby="comments-heading" className="space-y-6 border-t pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="comments-heading" className="text-lg font-semibold tracking-tight">
          {post.commentsEnabled
            ? list.length
              ? `${list.length} ${list.length === 1 ? "comment" : "comments"}`
              : "Comments"
            : "Did you like it?"}
        </h2>
        <LikeButton slug={slug} postSlug={postSlug} initialLiked={liked} initialCount={likes} />
      </div>

      {list.length ? (
        <ol className="space-y-5">
          {list.map((c) => (
            <li key={c.id} className="space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{c.name}</span>
                {c.byAuthor ? (
                  <span className="rounded-full bg-(--accent) px-2 py-0.5 text-[11px] font-semibold text-white">
                    Author
                  </span>
                ) : c.bySubscriber ? (
                  <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
                    Subscriber
                  </span>
                ) : null}
                <time
                  className="text-muted-foreground text-xs"
                  dateTime={c.createdAt.toISOString()}
                >
                  {formatDate(c.createdAt)}
                </time>
              </p>
              <p className="leading-7 whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {post.commentsEnabled ? (
        <CommentForm slug={slug} postSlug={postSlug} remembered={remembered} />
      ) : null}
    </section>
  );
}
