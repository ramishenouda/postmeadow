import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { Mark } from "@/components/marketing/site-chrome";
import { db } from "@/db";
import { deliveries, posts, publications } from "@/db/schema";
import { APP_NAME } from "@/lib/brand";
import { formatDate } from "@/lib/format";
import { readSponsor } from "@/lib/sponsor";

export const metadata: Metadata = {
  title: "Sponsor results",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/sponsor/[token]">;

/** A results page the writer shares with a sponsor. Anyone with the link can see it. */
export default function SponsorReportPage({ params }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-16">
      <Suspense fallback={<div className="bg-muted h-80 rounded-2xl" />}>
        <Report params={params} />
      </Suspense>
      <footer className="text-muted-foreground mt-auto pt-12 text-center text-xs">
        <Link href="/" className="hover:text-foreground inline-flex items-center gap-1.5">
          <Mark className="size-4" /> Newsletter by {APP_NAME}
        </Link>
      </footer>
    </main>
  );
}

async function Report({ params }: Pick<Props, "params">) {
  const { token } = await params;
  if (!/^[\w-]{20,}$/.test(token)) notFound();
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      sponsor: posts.sponsor,
      publishedAt: posts.publishedAt,
      publication: publications.name,
    })
    .from(posts)
    .innerJoin(publications, eq(publications.id, posts.publicationId))
    .where(eq(posts.sponsorReportToken, token));
  const sponsor = readSponsor(row?.sponsor);
  if (!row || !sponsor) notFound();

  const [totals] = await db.execute<{ delivered: number; opened: number; clicked: number }>(sql`
    select
      count(*) filter (where d.status in ('sent', 'complained'))::int as delivered,
      count(d.opened_at)::int as opened,
      (select count(distinct c.delivery_id)::int from delivery_link_clicks c
        join ${deliveries} d2 on d2.id = c.delivery_id
        where d2.post_id = ${row.id} and c.url = ${sponsor.url}) as clicked
    from ${deliveries} d where d.post_id = ${row.id}
  `);
  const pct = (n: number) =>
    totals.delivered ? `${Math.round((n / totals.delivered) * 1000) / 10}%` : "–";
  const sent = row.status === "sent" || row.status === "sending";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
          Sponsor results · {sponsor.name}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{row.title}</h1>
        <p className="text-muted-foreground text-sm">
          {row.publication}
          {sent && row.publishedAt ? ` · sent ${formatDate(row.publishedAt)}` : " · not sent yet"}
        </p>
      </header>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ["Delivered", totals.delivered.toLocaleString("en"), "inboxes"],
          ["Opened", pct(totals.opened), `${totals.opened.toLocaleString("en")} readers`],
          [
            "Clicked your link",
            totals.clicked.toLocaleString("en"),
            `${pct(totals.clicked)} of readers`,
          ],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl border p-5">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
            <dd className="text-muted-foreground mt-1 text-xs">{note}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-2 rounded-xl border p-5">
        <h2 className="text-sm font-medium">The placement</h2>
        <p className="leading-7">{sponsor.text}</p>
        <p className="text-muted-foreground text-sm break-all">
          {sponsor.cta} → {sponsor.url}
        </p>
      </section>
      <p className="text-muted-foreground text-xs">
        Opens are approximate: some mail apps load images automatically, which counts as an open.
        Clicks are counted once per reader.
      </p>
    </div>
  );
}
