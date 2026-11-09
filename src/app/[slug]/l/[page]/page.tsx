import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand, Logo, Monogram } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import {
  getLandingPage,
  getPublicPublication,
  getPublishedPosts,
  getReaderCount,
} from "@/lib/public-data";
import { SubscribeForm } from "../../subscribe-form";

type Props = PageProps<"/[slug]/l/[page]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page } = await params;
  const [publication, landing] = await Promise.all([
    getPublicPublication(slug),
    getLandingPage(slug, page),
  ]);
  if (!publication || !landing) return { title: "Not found" };
  return {
    title: { absolute: `${landing.headline} · ${publication.name}` },
    description: publication.description ?? undefined,
    alternates: { canonical: `/${slug}/l/${page}` },
    openGraph: { title: landing.headline, siteName: publication.name },
  };
}

/** A focused sign-up page for a campaign: no archive, one job. */
export default function LandingPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-3xl" />}>
      <Landing params={params} />
    </Suspense>
  );
}

async function Landing({ params }: Pick<Props, "params">) {
  const { slug, page } = await params;
  const [publication, landing] = await Promise.all([
    getPublicPublication(slug),
    getLandingPage(slug, page),
  ]);
  if (!publication || !landing) notFound();
  const [readers, posts] = await Promise.all([
    getReaderCount(publication.id),
    getPublishedPosts(slug),
  ]);

  return (
    <Brand publication={publication}>
      <div className="space-y-10">
        <section className="rounded-3xl border border-(--accent)/15 bg-(--accent)/5 px-6 py-12 text-center sm:px-12">
          <div className="flex justify-center">
            {publication.logoUrl ? (
              <Logo publication={publication} className="h-12" />
            ) : (
              <Monogram name={publication.name} />
            )}
          </div>
          <p className="text-muted-foreground mt-5 text-sm font-medium">{publication.name}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {landing.headline}
          </h1>
          {landing.body ? (
            <div className="mx-auto mt-6 max-w-lg text-left">
              <Markdown content={landing.body} className="prose-li:my-1" />
            </div>
          ) : publication.description ? (
            <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-lg">
              {publication.description}
            </p>
          ) : null}
          <div className="mx-auto mt-8 max-w-md text-left">
            <SubscribeForm
              slug={slug}
              hiddenTags={landing.tag ? [landing.tag] : []}
              buttonText={landing.buttonText}
            />
          </div>
          {readers >= 10 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Join {readers.toLocaleString("en")} readers
            </p>
          ) : null}
        </section>

        {posts.length ? (
          <section className="space-y-2" aria-labelledby="recent-heading">
            <h2
              id="recent-heading"
              className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase"
            >
              Recent issues
            </h2>
            <ul className="divide-y">
              {posts.slice(0, 3).map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/${slug}/p/${p.slug}`}
                    className="block py-3 font-medium hover:text-(--accent)"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Brand>
  );
}
