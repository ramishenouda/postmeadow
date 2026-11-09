import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { hasLegalPlaceholders, LEGAL_UPDATED } from "@/lib/legal";

/** Shared frame for /terms and /privacy. */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
        {hasLegalPlaceholders() ? (
          <p
            role="note"
            className="mb-8 rounded-lg border border-amber-600/20 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            Draft: the operator details are placeholders. Fill them in in{" "}
            <code>src/lib/legal.ts</code>, and have a lawyer review this page before launch.
          </p>
        ) : null}
        <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">Last updated {LEGAL_UPDATED}</p>
        <p className="text-muted-foreground mt-6 text-lg">{intro}</p>
        <div className="prose prose-stone prose-headings:font-display prose-h2:text-2xl mt-10 max-w-none">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
