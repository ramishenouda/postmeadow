import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Your account has been deleted
        </h1>
        <p className="text-muted-foreground">
          Your publication, posts, subscribers and images are gone, and any paid plan has been
          cancelled. We&apos;ve sent you a confirmation email.
        </p>
        <Link href="/" className="inline-block text-sm underline underline-offset-4">
          Back to the home page
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
