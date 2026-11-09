import Link from "next/link";
import { formatMoney } from "@/lib/format-money";
import { PaidLoginForm } from "./paid-login-form";

/** Shown under a paid post's preview for readers who don't pay (yet). */
export function Paywall({
  publication,
  next,
}: {
  publication: {
    slug: string;
    name: string;
    acceptsPayments: boolean;
    paidCurrency: string;
    paidMonthlyCents: number | null;
    paidYearlyCents: number | null;
  };
  next: string;
}) {
  const {
    paidMonthlyCents: monthly,
    paidYearlyCents: yearly,
    paidCurrency: currency,
  } = publication;
  return (
    <aside className="space-y-4 rounded-2xl border border-(--accent)/25 bg-(--accent)/5 p-6 text-center sm:p-8">
      <p className="text-lg font-semibold">This post is for paid subscribers</p>
      <p className="text-muted-foreground text-sm">
        {publication.acceptsPayments
          ? [
              monthly ? `${formatMoney(monthly, currency)} a month` : null,
              yearly ? `${formatMoney(yearly, currency)} a year` : null,
            ]
              .filter(Boolean)
              .join(" or ") + `. Support ${publication.name} and read everything.`
          : "Paid subscriptions aren't open right now."}
      </p>
      {publication.acceptsPayments ? (
        <Link
          href={`/${publication.slug}/upgrade`}
          className="inline-flex rounded-lg bg-(--accent) px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Upgrade to paid
        </Link>
      ) : null}
      <PaidLoginForm slug={publication.slug} next={next} />
    </aside>
  );
}
