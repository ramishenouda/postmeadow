import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/marketing/site-chrome";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { adminOverview, requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { REPUTATION } from "@/lib/reputation";
import { PauseButton } from "./pause-button";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

type Props = PageProps<"/admin">;

/** Accounts at a glance, with what usually signals abuse, and a pause switch. */
export default function AdminPage({ searchParams }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Everything, header included, waits for the admin check: others see only "not found". */}
      <Suspense
        fallback={<div className="bg-muted mx-auto my-8 h-96 w-full max-w-7xl rounded-xl" />}
      >
        <Overview searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function AdminHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4">
        <Link href="/dashboard">
          <Wordmark size="sm" />
        </Link>
        <span className="rounded-full bg-stone-900 px-2 py-0.5 text-xs font-medium text-white">
          Admin
        </span>
      </div>
    </header>
  );
}

const fmt = (n: number) => n.toLocaleString("en");
const rate = (part: number, whole: number) =>
  whole ? `${((part / whole) * 100).toFixed(part / whole < 0.01 ? 2 : 1)}%` : "–";

async function Overview({ searchParams }: Pick<Props, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const rows = await adminOverview(q);
  const flagged = rows.filter((r) => r.flags.length > 0).length;

  return (
    <>
      <AdminHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Publications</h1>
            <p className="text-muted-foreground text-sm">
              {fmt(rows.length)} shown, {fmt(flagged)} need a look. Paused automatically above{" "}
              {REPUTATION.maxComplaintRate * 100}% spam reports or {REPUTATION.maxBounceRate * 100}%
              bounces (last {REPUTATION.windowDays} days, from {REPUTATION.minDelivered} emails).
            </p>
          </div>
          <form role="search">
            <Input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search name, address or owner"
              className="h-9 w-72"
              aria-label="Search publications"
            />
          </form>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Publication</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 text-right font-medium">Active</th>
                <th className="px-3 py-2 text-right font-medium">New / imported (7d)</th>
                <th className="px-3 py-2 text-right font-medium">Emails this month</th>
                <th className="px-3 py-2 text-right font-medium">Bounces (30d)</th>
                <th className="px-3 py-2 text-right font-medium">Spam (30d)</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className={r.flags.length ? "bg-amber-50/40" : undefined}>
                  <td className="px-3 py-2">
                    <Link href={`/${r.slug}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      /{r.slug} · {r.ownerEmail} · since {formatDate(r.createdAt)}
                    </p>
                  </td>
                  <td className="px-3 py-2 capitalize">{r.plan}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.active)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(r.added7)} / {fmt(r.imported7)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.emailsMonth)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {rate(r.bounced30, r.delivered30)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {rate(r.complained30, r.delivered30)}
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    {r.suspendedAt ? <StatusBadge status="paused" /> : null}
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {r.flags
                        .filter((f) => f !== "Paused")
                        .map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      {r.suspendedReason ? (
                        <li className="text-muted-foreground">Reason: {r.suspendedReason}</li>
                      ) : null}
                    </ul>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <PauseButton id={r.id} paused={r.suspendedAt !== null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
