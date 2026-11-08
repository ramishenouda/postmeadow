import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { getPublicPublication } from "@/lib/public-data";
import { SubscribeForm } from "../../[slug]/subscribe-form";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false } };

type Props = PageProps<"/embed/[slug]">;

/**
 * A compact signup form for writers to put on their own websites in an <iframe>.
 * This is the only page that may be framed by other sites (see next.config.ts).
 */
export default function EmbedPage({ params }: Props) {
  return (
    <main className="p-3">
      <Suspense>
        <Embed params={params} />
      </Suspense>
    </main>
  );
}

async function Embed({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();
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
