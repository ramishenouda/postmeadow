import type { Metadata } from "next";
import { Faq } from "@/components/marketing/faq";
import { PricingTable } from "@/components/marketing/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free forever with every feature. Pro and Business add storage for image-heavy newsletters.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-muted-foreground text-lg">
            Every feature on every plan. Pay only when you need more storage.
          </p>
        </div>
        <div className="mt-12">
          <PricingTable />
        </div>
        <div className="mx-auto mt-20 max-w-3xl">
          <h2 className="mb-6 text-2xl font-semibold tracking-tight">Questions</h2>
          <Faq />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
