import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import {
  churn,
  ENGAGEMENT_LABELS,
  ENGAGEMENT_LEVELS,
  engagementBreakdown,
  postPerformance,
  readerSources,
  RECENT_ISSUES,
} from "@/lib/stats";

export const metadata: Metadata = { title: "Stats" };

const PERIODS = [30, 90, 365] as const;

type Props = PageProps<"/dashboard/stats">;

export default function StatsPage({ searchParams }: Props) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="text-muted-foreground text-sm">
          Where your readers come from, how engaged they are, and how each issue did.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Stats searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Stats({ searchParams }: Pick<Props, "searchParams">) {
  const { publication } = await requirePublication("editor");
  const { days: rawDays } = await searchParams;
  const days = PERIODS.find((d) => String(d) === rawDays) ?? 30;
  const [sources, engagement, issues, flow] = await Promise.all([
    readerSources(publication.id, days),
    engagementBreakdown(publication.id),
    postPerformance(publication.id, 10),
    churn(publication.id, days),
  ]);
  const active = ENGAGEMENT_LEVELS.reduce((n, l) => n + engagement[l], 0);
  const sourceTotal = sources.reduce((n, s) => n + s.n, 0);
  const bringers = issues
    .filter((p) => p.newReaders > 0)
    .sort((a, b) => b.newReaders - a.newReaders);

  return (
    <div className="space-y-10">
      <nav className="bg-muted flex w-fit gap-1 rounded-lg p-1 text-sm" aria-label="Period">
        {PERIODS.map((d) => (
          <Link
            key={d}
            href={d === 30 ? "/dashboard/stats" : `/dashboard/stats?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={
              d === days
                ? "bg-background rounded-md px-3 py-1.5 font-medium shadow-sm"
                : "text-muted-foreground rounded-md px-3 py-1.5"
            }
          >
            {d === 365 ? "12 months" : `${d} days`}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-4">
        <Tile label="Active readers" value={active} />
        <Tile label={`New in ${days === 365 ? "12 months" : `${days} days`}`} value={flow.gained} />
        <Tile label="Unsubscribed" value={flow.lost} />
        <Tile label="Taking a break" value={flow.paused} hint="paused emails for now" />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="font-medium">
            Where new readers came from
          </h2>
          {sources.length ? (
            <BarList
              rows={sources.map((s) => ({ key: s.key, label: s.label, value: s.n }))}
              total={sourceTotal}
            />
          ) : (
            <Empty>No new readers in this period yet.</Empty>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="engagement-heading">
          <h2 id="engagement-heading" className="font-medium">
            Reader engagement
          </h2>
          {active ? (
            <>
              <BarList
                rows={ENGAGEMENT_LEVELS.map((l) => ({
                  key: l,
                  label: ENGAGEMENT_LABELS[l].label,
                  value: engagement[l],
                  href: `/dashboard/subscribers?engagement=${l}`,
                  note: ENGAGEMENT_LABELS[l].note,
                }))}
                total={active}
              />
              <p className="text-muted-foreground text-xs">
                Based on your last {RECENT_ISSUES} issues. Opens are approximate (some mail apps
                load images automatically). Click a row to see those readers; dormant readers are
                good candidates for a “still interested?” email, or for removal.
              </p>
            </>
          ) : (
            <Empty>No active readers yet.</Empty>
          )}
        </section>
      </div>

      <section className="space-y-3" aria-labelledby="bringers-heading">
        <h2 id="bringers-heading" className="font-medium">
          Posts that brought readers
        </h2>
        {bringers.length ? (
          <BarList
            rows={bringers.slice(0, 5).map((p) => ({
              key: p.id,
              label: p.title,
              value: p.newReaders,
              href: `/dashboard/posts/${p.id}`,
            }))}
            total={Math.max(...bringers.map((p) => p.newReaders))}
            showShare={false}
          />
        ) : (
          <Empty>
            When someone subscribes from a post&apos;s page, that post is counted here. Share your
            posts to see which ones win readers.
          </Empty>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="issues-heading">
        <h2 id="issues-heading" className="font-medium">
          Recent issues
        </h2>
        {issues.length ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs">
                <tr>
                  <th className="px-4 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 text-right font-medium">Delivered</th>
                  <th className="px-3 py-2 text-right font-medium">Opened</th>
                  <th className="px-3 py-2 text-right font-medium">Clicked</th>
                  <th className="px-3 py-2 text-right font-medium">New readers</th>
                  <th className="px-3 py-2 text-right font-medium">Likes</th>
                  <th className="px-4 py-2 text-right font-medium">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {issues.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/dashboard/posts/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      <p className="text-muted-foreground text-xs">{formatDate(p.publishedAt)}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{p.delivered.toLocaleString("en")}</td>
                    <td className="px-3 py-2 text-right">{p.openRate}%</td>
                    <td className="px-3 py-2 text-right">{p.clickRate}%</td>
                    <td className="px-3 py-2 text-right">{p.newReaders.toLocaleString("en")}</td>
                    <td className="px-3 py-2 text-right">{p.likes.toLocaleString("en")}</td>
                    <td className="px-4 py-2 text-right">{p.comments.toLocaleString("en")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Send your first issue to see how it does.</Empty>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value.toLocaleString("en")}</CardTitle>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

/**
 * Horizontal bars, one series (so no legend). Labels and values are text, in text
 * colours; the bar only carries magnitude. Bars are relative to `total`.
 */
function BarList({
  rows,
  total,
  showShare = true,
}: {
  rows: { key: string; label: string; value: number; href?: string; note?: string }[];
  total: number;
  showShare?: boolean;
}) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const share = total ? r.value / total : 0;
        const label = (
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate" title={r.note}>
              {r.label}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {r.value.toLocaleString("en")}
              {showShare && total ? ` · ${Math.round(share * 100)}%` : ""}
            </span>
          </span>
        );
        return (
          <li key={r.key} className="space-y-1">
            {r.href ? (
              <Link href={r.href} className="block hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
            <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.max(share * 100, r.value ? 2 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
      {children}
    </p>
  );
}
