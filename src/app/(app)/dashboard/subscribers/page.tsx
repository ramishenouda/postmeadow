import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/db";
import { subscribers, subscriberStatus } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { AddSubscriberForm } from "./add-subscriber-form";
import { RemoveSubscriberButton } from "./remove-subscriber-button";

export const metadata: Metadata = { title: "Subscribers · Newsletter" };

const PAGE_SIZE = 50;
type Status = (typeof subscriberStatus.enumValues)[number];

type Props = PageProps<"/dashboard/subscribers">;

export default function SubscribersPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Subscribers</h1>
          <p className="text-muted-foreground text-sm">
            People who signed up on your page, or whom you added yourself.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/subscribers/export"
            prefetch={false}
            className={buttonVariants({ variant: "outline" })}
          >
            Export CSV
          </Link>
          <Link href="/dashboard/subscribers/import" className={buttonVariants()}>
            Import
          </Link>
        </div>
      </div>
      <AddSubscriberForm />
      <Suspense fallback={<div className="bg-muted h-80 animate-pulse rounded-xl" />}>
        <SubscriberList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SubscriberList({ searchParams }: Pick<Props, "searchParams">) {
  const { publication } = await requirePublication();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = (subscriberStatus.enumValues as readonly string[]).includes(String(params.status))
    ? (params.status as Status)
    : undefined;
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);

  const filters: SQL[] = [eq(subscribers.publicationId, publication.id)];
  if (q) filters.push(ilike(subscribers.email, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
  if (status) filters.push(eq(subscribers.status, status));
  const where = and(...filters);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(subscribers)
      .where(where)
      .orderBy(desc(subscribers.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(subscribers).where(where),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return `/dashboard/subscribers${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by email"
          className="h-9 w-full sm:w-64"
          aria-label="Search by email"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Status"
          className="bg-background h-9 rounded-lg border px-2.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Unconfirmed</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
        </select>
        <Button type="submit" variant="outline" className="h-9">
          Filter
        </Button>
        {q || status ? (
          <Link
            href="/dashboard/subscribers"
            className={buttonVariants({ variant: "ghost", className: "h-9" })}
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">
            {q || status ? "No subscribers match these filters" : "No subscribers yet"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {q || status ? (
              "Try a different search."
            ) : (
              <>
                Share your page at{" "}
                <Link href={`/${publication.slug}`} className="underline">
                  /{publication.slug}
                </Link>
                , add people above, or import a list.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Added</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.email}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {formatDate(s.createdAt)}
                  </TableCell>
                  <TableCell>
                    <RemoveSubscriberButton id={s.id} email={s.email} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          {total.toLocaleString("en")} {total === 1 ? "subscriber" : "subscribers"}
        </span>
        {pages > 1 ? (
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Previous
              </Link>
            ) : null}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link
                href={pageHref(page + 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Next
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
