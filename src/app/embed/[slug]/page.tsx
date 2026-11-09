import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand, Logo, Monogram } from "@/components/brand";
import { getPublicPublication } from "@/lib/public-data";
import { SubscribeForm } from "../../[slug]/subscribe-form";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false } };

type Props = PageProps<"/embed/[slug]">;

/**
 * A compact signup form for writers to put on their own websites in an <iframe>.
 * This is the only page that may be framed by other sites (see next.config.ts).
 */
export default function EmbedPage({ params, searchParams }: Props) {
  return (
    <main className="p-3">
      <Suspense>
        <Embed params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Embed({ params, searchParams }: Props) {
  const { slug } = await params;
  const { popup } = await searchParams;
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();
  if (popup) {
    // Inside the pop-up from /embed/{slug}/popup.js: a bigger pitch.
    return (
      <Brand publication={publication}>
        <div className="space-y-4 px-3 pt-5 pb-2 text-center">
          <div className="flex justify-center">
            {publication.logoUrl ? (
              <Logo publication={publication} className="h-10" />
            ) : (
              <Monogram name={publication.name} />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xl font-semibold tracking-tight">
              {publication.popupHeadline || `Get ${publication.name} in your inbox`}
            </p>
            {publication.description ? (
              <p className="text-muted-foreground line-clamp-2 text-sm">
                {publication.description}
              </p>
            ) : null}
          </div>
          <div className="text-left">
            <SubscribeForm slug={publication.slug} />
          </div>
        </div>
      </Brand>
    );
  }
  return (
    <Brand publication={publication}>
      <div className="space-y-2">
        <p className="font-medium">
          Subscribe to{" "}
          <a
            href={`/${publication.slug}`}
            target="_blank"
            rel="noopener"
            className="underline-offset-2 hover:underline"
          >
            {publication.name}
          </a>
        </p>
        <SubscribeForm slug={publication.slug} />
      </div>
    </Brand>
  );
}
