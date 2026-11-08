import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { env } from "@/env";
import { getOwnedPost } from "@/lib/posts";
import { PostEditor } from "../post-editor";

export const metadata: Metadata = { title: "Edit web version" };

type Props = PageProps<"/dashboard/posts/[id]/edit">;

/** Edit the web version of a post that was already sent. */
export default function EditSentPostPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="bg-muted h-[70vh] animate-pulse rounded-xl" />}>
      <EditSent params={params} />
    </Suspense>
  );
}

async function EditSent({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const owned = await getOwnedPost(id);
  if (!owned) notFound();
  const { user, publication, post } = owned;
  // Drafts and scheduled posts are edited on the post page itself.
  if (post.status !== "sent") redirect(`/dashboard/posts/${post.id}`);

  return (
    <PostEditor
      mode="sent"
      post={{
        id: post.id,
        title: post.title,
        subtitle: post.subtitle ?? "",
        slug: post.slug,
        content: post.content,
      }}
      urlPrefix={`${new URL(env.APP_URL).host}/${publication.slug}/p/`}
      activeSubscribers={0}
      ownerEmail={user.email}
    />
  );
}
