import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { Brand } from "@/components/brand";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import { getPublicPublication } from "@/lib/public-data";
import { listRecommendations } from "@/lib/recommendations";
import { referralSummary } from "@/lib/referrals";
import { verify } from "@/lib/signed";
import { ReferralCard } from "@/components/referral-card";
import { RecommendationPicker } from "./recommendation-picker";

type Props = PageProps<"/[slug]/subscribed">;

export default function SubscribedPage({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Subscribed params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Subscribed({ params, searchParams }: Props) {
  const { slug } = await params;
  const { w } = await searchParams;
  await connection(); // checking the proof reads the clock
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();

  // Who just confirmed (a signed, hour-long proof from the confirmation link).
  const subscriberId = verify("welcome", typeof w === "string" ? w : null);
  const [reader] = subscriberId
    ? await db
        .select({
          id: subscribers.id,
          publicationId: subscribers.publicationId,
          status: subscribers.status,
          referralsEnabled: publications.referralsEnabled,
        })
        .from(subscribers)
        .innerJoin(publications, eq(publications.id, subscribers.publicationId))
        .where(eq(subscribers.id, subscriberId))
    : [];
  const known = reader && reader.publicationId === publication.id && reader.status === "active";
  const [recommended, referral] = known
    ? await Promise.all([
        listRecommendations(publication.id),
        reader.referralsEnabled ? referralSummary(reader.id, publication.id, slug) : null,
      ])
    : [[], null];

  return (
    <Brand publication={publication}>
      <div className="space-y-10 py-8">
        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">You&apos;re subscribed</h1>
          <p className="text-muted-foreground">
            Thanks for confirming. New posts from {publication.name} will arrive in your inbox.
          </p>
          <Link href={`/${publication.slug}`} className="inline-block text-sm underline">
            Read the archive
          </Link>
        </div>

        {recommended.length && typeof w === "string" ? (
          <RecommendationPicker
            from={publication.name}
            proof={w}
            slug={slug}
            items={recommended.map((r) => ({
              id: r.id,
              name: r.name,
              slug: r.slug,
              description: r.description,
              note: r.note,
            }))}
          />
        ) : null}

        {referral ? <ReferralCard publicationName={publication.name} summary={referral} /> : null}
      </div>
    </Brand>
  );
}
