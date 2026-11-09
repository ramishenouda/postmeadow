import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { Brand, Logo } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/format";
import { markdownExcerpt, readingMinutes } from "@/lib/markdown/excerpt";
import { parseMarkdown } from "@/lib/markdown/parse";
import { getPublicPublication, getPublishedPost, getPublishedPosts } from "@/lib/public-data";
import { SponsorCard } from "@/components/sponsor-card";
import { readSponsor } from "@/lib/sponsor";
import { SubscribeForm } from "../../subscribe-form";
import { Reactions } from "./reactions";
import { Paywall } from "@/components/paywall";
import { payingReader } from "@/lib/paid-access";
import { previewMarkdown } from "@/lib/paid-preview";

type Props = PageProps<"/[slug]/p/[postSlug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params;
  const [publication, post] = await Promise.all([
    getPublicPublication(slug),
    getPublishedPost(slug, postSlug),
  ]);
  if (!publication || !post) return { title: "Not found" };
  // Paid posts: only the free beginning may appear anywhere public.
  const free = post.paid ? previewMarkdown(post.content).preview : post.content;
  const description = post.subtitle || markdownExcerpt(parseMarkdown(free), 160);
  return {
    title: { absolute: `${post.title} · ${publication.name}` },
    description,
    alternates: {
      canonical: `/${slug}/p/${postSlug}`,
      types: { "application/rss+xml": `/${slug}/feed.xml` },
    },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      siteName: publication.name,
      publishedTime: post.publishedAt?.toISOString(),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
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
  const [publication, post, archive] = await Promise.all([
    getPublicPublication(slug),
    getPublishedPost(slug, postSlug),
    getPublishedPosts(slug),
  ]);
  if (!publication || !post) notFound();
  const minutes = readingMinutes(parseMarkdown(post.content));
  const more = archive.filter((p) => p.slug !== post.slug).slice(0, 3);
  const sponsor = readSponsor(post.sponsor);
  // Paid posts: the full text only for paying readers; others get the beginning.
  if (post.paid) await connection(); // the access check reads cookies and the clock
  const reader = post.paid ? await payingReader(slug, publication.id) : null;
  const locked = post.paid && !reader;
  const shown = locked ? previewMarkdown(post.content).preview : post.content;

  return (
    <Brand publication={publication}>
      <article className="space-y-10">
        <header className="space-y-5">
          <Link
            href={`/${publication.slug}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
          >
            {publication.logoUrl ? (
              <Logo publication={publication} className="h-7" />
            ) : (
              <ArrowLeft className="size-4" aria-hidden />
            )}
            {publication.name}
          </Link>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {post.title}
          </h1>
          {post.subtitle ? (
            <p className="text-muted-foreground text-xl leading-8 text-pretty">{post.subtitle}</p>
          ) : null}
          <p className="text-muted-foreground border-b pb-6 text-sm">
            {[
              post.author?.trim() ? `By ${post.author.trim()}` : null,
              formatDate(post.publishedAt),
              `${minutes} min read`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        {sponsor?.position === "top" ? <SponsorCard sponsor={sponsor} /> : null}

        <Markdown
          content={shown}
          className="prose-lg prose-a:text-(--accent) prose-a:underline-offset-2 prose-img:rounded-xl prose-img:border prose-blockquote:border-l-(--accent) prose-headings:tracking-tight"
        />

        {locked ? (
          <Paywall publication={publication} next={`/${publication.slug}/p/${post.slug}`} />
        ) : null}

        {sponsor?.position === "bottom" ? <SponsorCard sponsor={sponsor} /> : null}

        <aside className="space-y-4 rounded-2xl border border-(--accent)/15 bg-(--accent)/5 p-6 sm:p-8">
          <div className="space-y-1">
            <p className="text-lg font-semibold">Enjoyed this? Get the next one in your inbox.</p>
            <p className="text-muted-foreground text-sm">
              Free, straight to your inbox. Unsubscribe any time.
            </p>
          </div>
          <SubscribeForm slug={publication.slug} postSlug={post.slug} />
        </aside>

        <Suspense fallback={<div className="bg-muted h-40 animate-pulse rounded-xl" />}>
          <Reactions slug={publication.slug} postSlug={post.slug} />
        </Suspense>

        {more.length > 0 ? (
          <section aria-labelledby="more-heading" className="space-y-2 border-t pt-10">
            <h2
              id="more-heading"
              className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase"
            >
              More from {publication.name}
            </h2>
            <ul className="divide-y">
              {more.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/${publication.slug}/p/${p.slug}`}
                    className="group flex items-center gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold tracking-tight group-hover:text-(--accent)">
                        {p.title}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatDate(p.publishedAt)} · {p.minutes} min read
                      </p>
                    </div>
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- images from our own storage
                      <img
                        src={p.image.url}
                        alt=""
                        loading="lazy"
                        className="bg-muted aspect-[4/3] w-20 shrink-0 rounded-md border object-cover"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </Brand>
  );
}
