import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPublicPublication } from "@/lib/public-data";

export default function SubscribedPage({ params }: PageProps<"/[slug]/subscribed">) {
  return (
    <Suspense>
      <Subscribed params={params} />
    </Suspense>
  );
}

async function Subscribed({ params }: Pick<PageProps<"/[slug]/subscribed">, "params">) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">You&apos;re subscribed</h1>
      <p className="text-muted-foreground">
        Thanks for confirming. New posts from {publication.name} will arrive in your inbox.
      </p>
      <Link href={`/${publication.slug}`} className="inline-block text-sm underline">
        Read the archive
      </Link>
    </div>
  );
}
