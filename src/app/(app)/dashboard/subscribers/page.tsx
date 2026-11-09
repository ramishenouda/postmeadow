import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { count, desc } from "drizzle-orm";
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
import { subscribers } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { parseSubscriberFilter, subscriberFilterWhere } from "@/lib/subscriber-filters";
import { listTags, tagsBySubscriber } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { MAX_INVITES } from "@/lib/invitations";
import {
  canRemove,
  expiresAt,
  SUBSCRIBER_STATES,
  subscriberState,
  type SubscriberState,
} from "@/lib/subscribers";
import { AddSubscriberForm } from "./add-subscriber-form";
import { InviteAgainButton } from "./invite-again-button";
import { DeleteTagButton, EditTags, TagMatching } from "./tag-controls";
import { RemoveSubscriberButton } from "./remove-subscriber-button";

export const metadata: Metadata = { title: "Subscribers" };

const PAGE_SIZE = 50;

const STATE_LABELS: Record<SubscriberState, string> = {
  active: "Active",
  invited: "Invited",
  unconfirmed: "Unconfirmed",
  expired: "Expired",
  declined: "Declined",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
};

type Props = PageProps<"/dashboard/subscribers">;

export default function SubscribersPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Subscribers</h1>
          <p className="text-muted-foreground text-sm">
            People who signed up on your page, or accepted your invitation.
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
  const filter = parseSubscriberFilter(params);
  const { q, status, tag } = filter;
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const where = subscriberFilterWhere(publication.id, filter);

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
  const [allTags, rowTags] = await Promise.all([
    listTags(publication.id),
    tagsBySubscriber(rows.map((r) => r.id)),
  ]);
  const filtered = Boolean(q || status || tag);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (tag) next.set("tag", tag);
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
          <option value="waiting">Awaiting an answer</option>
          {SUBSCRIBER_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </select>
        {allTags.length ? (
          <select
            name="tag"
            defaultValue={tag ?? ""}
            aria-label="Tag"
            className="bg-background h-9 rounded-lg border px-2.5 text-sm"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="submit" variant="outline" className="h-9">
          Filter
        </Button>
        {filtered ? (
          <Link
            href="/dashboard/subscribers"
            className={buttonVariants({ variant: "ghost", className: "h-9" })}
          >
            Clear
          </Link>
        ) : null}
      </form>

      {allTags.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground mr-1">Tags:</span>
          {allTags.map((t) => (
            <span
              key={t.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-2.5 text-xs",
                tag === t.id && "border-primary bg-primary/5",
              )}
            >
              <Link href={`/dashboard/subscribers?tag=${t.id}`} className="hover:underline">
                {t.name}
              </Link>
              <span className="text-muted-foreground tabular-nums">{t.active}</span>
              <DeleteTagButton id={t.id} name={t.name} count={t.active} />
            </span>
          ))}
        </div>
      ) : null}

      {filtered && total > 0 ? <TagMatching filter={filter} total={total} /> : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">
            {filtered ? "No subscribers match these filters" : "No subscribers yet"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {filtered ? (
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
              {rows.map((s) => {
                const state = subscriberState(s);
                const note = stateNote(s, state);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{s.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {(rowTags.get(s.id) ?? []).map((t) => (
                          <Link
                            key={t.id}
                            href={`/dashboard/subscribers?tag=${t.id}`}
                            className="bg-muted text-muted-foreground hover:text-foreground rounded-full px-2 py-0.5 text-xs"
                          >
                            {t.name}
                          </Link>
                        ))}
                        <EditTags
                          subscriberId={s.id}
                          email={s.email}
                          current={(rowTags.get(s.id) ?? []).map((t) => t.name)}
                          allTags={allTags.map((t) => t.name)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={state} />
                      {note ? (
                        <p
                          className="text-muted-foreground mt-1 max-w-xs truncate text-xs"
                          title={note}
                        >
                          {note}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {state === "expired" && s.invitedAt && s.inviteCount < MAX_INVITES ? (
                        <InviteAgainButton id={s.id} />
                      ) : canRemove(s) ? (
                        <RemoveSubscriberButton id={s.id} email={s.email} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
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

/** The small line under a status: when an invitation expires or expired, or why. */
function stateNote(
  s: { statusReason: string | null; confirmSentAt: Date | null; invitedAt: Date | null },
  state: SubscriberState,
): string | null {
  const expiry = expiresAt(s.confirmSentAt);
  switch (state) {
    case "invited":
    case "unconfirmed":
      return expiry ? `Expires ${formatDate(expiry)}` : null;
    case "expired":
      return expiry
        ? `${s.invitedAt ? "Invitation" : "Confirmation link"} expired ${formatDate(expiry)}`
        : null;
    case "declined":
      return "Declined your invitation";
    default:
      return s.statusReason;
  }
}
