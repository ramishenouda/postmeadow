import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand, Logo } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/format";
import { markdownExcerpt } from "@/lib/markdown/excerpt";
import { parseMarkdown } from "@/lib/markdown/parse";
import { getPublicPublication, getPublishedPost } from "@/lib/public-data";
import { SubscribeForm } from "../../subscribe-form";

type Props = PageProps<"/[slug]/p/[postSlug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params;
  const [publication, post] = await Promise.all([
    getPublicPublication(slug),
    getPublishedPost(slug, postSlug),
  ]);
  if (!publication || !post) return { title: "Not found" };
  return {
    title: { absolute: `${post.title} · ${publication.name}` },
    description: post.subtitle || markdownExcerpt(parseMarkdown(post.content), 160),
  };
}

export default function PostPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded" aria-busy="true" />}>
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: Pick<Props, "params">) {
  const { slug, postSlug } = await params;
  const [publication, post] = await Promise.all([
    getPublicPublication(slug),
    getPublishedPost(slug, postSlug),
  ]);
  if (!publication || !post) notFound();

  return (
    <Brand publication={publication}>
      <article className="space-y-10">
        <header className="space-y-3">
          <Logo publication={publication} className="h-8" />
          <Link
            href={`/${publication.slug}`}
            className="text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            {publication.name}
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight text-balance">{post.title}</h1>
          {post.subtitle ? <p className="text-muted-foreground text-xl">{post.subtitle}</p> : null}
          <p className="text-muted-foreground text-sm">{formatDate(post.publishedAt)}</p>
        </header>

        <Markdown content={post.content} className="prose-a:text-(--accent)" />

        <aside className="bg-muted/30 space-y-3 rounded-xl border p-6">
          <p className="font-medium">Get the next one in your inbox</p>
          <SubscribeForm slug={publication.slug} />
        </aside>
      </article>
    </Brand>
  );
}
