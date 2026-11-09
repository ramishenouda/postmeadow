import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand, Logo, Monogram } from "@/components/brand";
import { formatDate } from "@/lib/format";
import { getPublicPublication, getPublishedPosts, getReaderCount } from "@/lib/public-data";
import { getPublicTopics } from "@/lib/topics";
import { SubscribeForm } from "./subscribe-form";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) return { title: "Not found" };
  return {
    title: { absolute: publication.name },
    description: publication.description ?? undefined,
    alternates: {
      canonical: `/${slug}`,
      types: { "application/rss+xml": `/${slug}/feed.xml` },
    },
  };
}

export default function PublicationPage({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<PublicationSkeleton />}>
      <Publication params={params} />
    </Suspense>
  );
}

async function Publication({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();
  const [posts, readers, topics] = await Promise.all([
    getPublishedPosts(slug),
    getReaderCount(publication.id),
    getPublicTopics(slug),
  ]);

  return (
    <Brand publication={publication}>
      <div className="space-y-14">
        <header className="rounded-3xl border border-(--accent)/15 bg-(--accent)/5 px-6 py-10 text-center sm:px-10 sm:py-12">
          <div className="flex justify-center">
            {publication.logoUrl ? (
              <Logo publication={publication} className="h-14" />
            ) : (
              <Monogram name={publication.name} />
            )}
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {publication.name}
          </h1>
          {publication.description ? (
            <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-lg text-pretty">
              {publication.description}
            </p>
          ) : null}
          <div className="mx-auto mt-7 max-w-md text-left">
            <SubscribeForm slug={publication.slug} topics={topics} />
          </div>
          {readers >= 10 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Join {readers.toLocaleString("en")} readers
            </p>
          ) : null}
          {publication.acceptsPayments ? (
            <p className="mt-3 text-sm">
              <Link
                href={`/${publication.slug}/upgrade`}
                className="font-medium text-(--accent) underline"
              >
                Become a paid subscriber
              </Link>
            </p>
          ) : null}
        </header>

        <section aria-labelledby="archive-heading" className="space-y-2">
          <h2
            id="archive-heading"
            className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase"
          >
            Archive
          </h2>
          {posts.length === 0 ? (
            <p className="text-muted-foreground py-6">
              No posts yet. Subscribe to get the first one.
            </p>
          ) : (
            <ul className="divide-y">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/${publication.slug}/p/${post.slug}`}
                    className="group flex items-start gap-5 py-6"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-xl leading-snug font-semibold tracking-tight text-balance group-hover:text-(--accent)">
                        {post.title}
                      </p>
                      {post.subtitle || post.excerpt ? (
                        <p className="text-muted-foreground line-clamp-2 leading-6">
                          {post.subtitle || post.excerpt}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground pt-1 text-xs">
                        {post.paid ? (
                          <span className="mr-1.5 rounded-full bg-(--accent) px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Paid
                          </span>
                        ) : null}
                        {formatDate(post.publishedAt)} · {post.minutes} min read
                      </p>
                    </div>
                    {post.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- images from our own storage, already resized
                      <img
                        src={post.image.url}
                        alt=""
                        loading="lazy"
                        className="bg-muted mt-1 aspect-[4/3] w-24 shrink-0 rounded-lg border object-cover sm:w-32"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Brand>
  );
}

function PublicationSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="bg-muted h-72 w-full animate-pulse rounded-3xl" />
      <div className="bg-muted h-20 w-full animate-pulse rounded" />
      <div className="bg-muted h-20 w-full animate-pulse rounded" />
    </div>
  );
}
