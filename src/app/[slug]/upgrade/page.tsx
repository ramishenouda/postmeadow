import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand, Logo, Monogram } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { getPublicPublication } from "@/lib/public-data";
import { UpgradeForm } from "./upgrade-form";

export const metadata: Metadata = { title: "Upgrade", robots: { index: false } };

type Props = PageProps<"/[slug]/upgrade">;

export default function UpgradePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-3xl" />}>
      <Upgrade params={params} />
    </Suspense>
  );
}

async function Upgrade({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();
  return (
    <Brand publication={publication}>
      <div className="space-y-8 py-6">
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            {publication.logoUrl ? (
              <Logo publication={publication} className="h-12" />
            ) : (
              <Monogram name={publication.name} />
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {`Become a paid subscriber of ${publication.name}`}
          </h1>
        </div>
        {publication.acceptsPayments ? (
          <>
            {publication.paidDescription ? (
              <div className="mx-auto max-w-lg">
                <Markdown content={publication.paidDescription} />
              </div>
            ) : (
              <p className="text-muted-foreground mx-auto max-w-lg text-center">
                Get every post, including the ones for paid subscribers, and support the writing.
              </p>
            )}
            <UpgradeForm
              slug={slug}
              currency={publication.paidCurrency}
              monthly={publication.paidMonthlyCents}
              yearly={publication.paidYearlyCents}
            />
            <p className="text-muted-foreground text-center text-xs">
              Payments are handled by Stripe. Cancel any time from the link in every email.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-center">
            {`${publication.name} doesn't take paid subscriptions right now.`}{" "}
            <Link href={`/${slug}`} className="underline">
              Subscribe for free
            </Link>
          </p>
        )}
      </div>
    </Brand>
  );
}
