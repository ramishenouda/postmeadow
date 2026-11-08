import type { Metadata } from "next";

export const metadata: Metadata = { title: "Link expired" };

export default function SubscriptionInvalidPage() {
  return (
    <main className="mx-auto max-w-md flex-1 space-y-3 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
      <p className="text-muted-foreground">
        The confirmation link is invalid, already used, or older than 7 days. Subscribe again from
        the publication&apos;s page to get a new one.
      </p>
    </main>
  );
}
