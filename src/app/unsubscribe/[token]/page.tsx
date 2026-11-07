import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { findByUnsubscribeToken } from "@/lib/subscribers";
import { unsubscribe } from "./actions";

export const metadata: Metadata = { title: "Unsubscribe · Newsletter", robots: { index: false } };

type Props = PageProps<"/unsubscribe/[token]">;

export default function UnsubscribePage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-24 text-center">
      <Suspense fallback={<div className="bg-muted mx-auto h-24 animate-pulse rounded" />}>
        <Unsubscribe params={params} />
      </Suspense>
    </main>
  );
}

// Opening this page never unsubscribes on its own: link scanners in mail
// clients follow links automatically. The reader has to press the button.
async function Unsubscribe({ params }: Pick<Props, "params">) {
  const { token } = await params;
  const subscriber = await findByUnsubscribeToken(token);

  if (!subscriber) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Link not recognised</h1>
        <p className="text-muted-foreground">
          This unsubscribe link is invalid. If you keep getting emails, reply to one and ask to be
          removed.
        </p>
      </div>
    );
  }

  if (subscriber.status === "unsubscribed" || subscriber.status === "bounced") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re unsubscribed</h1>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">{subscriber.email}</span> won&apos;t get any
          more emails from {subscriber.publicationName}.
        </p>
        <Link href={`/${subscriber.publicationSlug}`} className="inline-block text-sm underline">
          Changed your mind? Subscribe again
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Unsubscribe?</h1>
      <p className="text-muted-foreground">
        Stop sending emails from{" "}
        <span className="text-foreground font-medium">{subscriber.publicationName}</span> to{" "}
        <span className="text-foreground font-medium">{subscriber.email}</span>.
      </p>
      <form action={unsubscribe.bind(null, token)}>
        <Button type="submit" size="lg">
          Unsubscribe
        </Button>
      </form>
    </div>
  );
}
