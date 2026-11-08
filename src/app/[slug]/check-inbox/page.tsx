import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Brand, Logo } from "@/components/brand";
import { getPublicPublication } from "@/lib/public-data";

export const metadata: Metadata = { title: "Check your inbox", robots: { index: false } };

const ERRORS: Record<string, string> = {
  "invalid-email": "That doesn't look like an email address. Go back and try again.",
  "rate-limited": "Too many attempts from your connection. Wait a few minutes and try again.",
  paused: "Sign-ups are paused for a moment. Try again later.",
  "send-failed": "We couldn't send the confirmation email. Try again in a moment.",
};

type Props = PageProps<"/[slug]/check-inbox">;

/** Where the plain-HTML signup form (POST /api/subscribe/[slug]) sends readers. */
export default function CheckInboxPage(props: Props) {
  return (
    <Suspense>
      <CheckInbox {...props} />
    </Suspense>
  );
}

async function CheckInbox({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const publication = await getPublicPublication(slug);
  if (!publication) notFound();
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;

  return (
    <Brand publication={publication}>
      <div className="space-y-4 py-12 text-center">
        <Logo publication={publication} className="mx-auto" />
        <h1 className="text-3xl font-semibold tracking-tight">
          {error ? "That didn't work" : "Almost there"}
        </h1>
        <p className="text-muted-foreground">
          {error ??
            `Check your inbox and click the link we sent to confirm your subscription to ${publication.name}.`}
        </p>
        <Link href={`/${publication.slug}`} className="inline-block text-sm underline">
          {error ? `Subscribe on ${publication.name}'s page` : "Read the archive"}
        </Link>
      </div>
    </Brand>
  );
}
