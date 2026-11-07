import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import { getPublicPublication, getPublishedPosts } from "@/lib/public-data";
import { SubscribeForm } from "./subscribe-form";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) return { title: "Not found" };
  return { title: publication.name, description: publication.description ?? undefined };
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
  const posts = await getPublishedPosts(slug);

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">{publication.name}</h1>
        {publication.description ? (
          <p className="text-muted-foreground text-lg">{publication.description}</p>
        ) : null}
        <SubscribeForm slug={publication.slug} />
      </header>

      <section aria-labelledby="archive-heading" className="space-y-4">
        <h2
          id="archive-heading"
          className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
        >
          Archive
        </h2>
        {posts.length === 0 ? (
          <p className="text-muted-foreground">No posts yet. Subscribe to get the first one.</p>
        ) : (
          <ul className="divide-y">
            {posts.map((post) => (
              <li key={post.slug} className="py-4">
                <Link
                  href={`/${publication.slug}/p/${post.slug}`}
                  className="group block space-y-1"
                >
                  <p className="font-medium group-hover:underline">{post.title}</p>
                  {post.subtitle ? (
                    <p className="text-muted-foreground text-sm">{post.subtitle}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">{formatDate(post.publishedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PublicationSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="bg-muted h-10 w-2/3 animate-pulse rounded" />
      <div className="bg-muted h-6 w-full animate-pulse rounded" />
      <div className="bg-muted h-10 w-full animate-pulse rounded" />
    </div>
  );
}
