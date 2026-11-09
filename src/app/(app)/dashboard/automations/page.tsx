import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, automations, automationSteps, tags } from "@/db/schema";
import { TRIGGERS, type Trigger } from "@/lib/automations";
import { requirePublication } from "@/lib/dal";
import { listTags } from "@/lib/tags";
import { NewAutomationForm } from "./automation-forms";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="text-muted-foreground text-sm">
          Emails that send themselves: a welcome series for new readers, or a sequence when someone
          gets a tag (a course, an onboarding, a sale).
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const { publication } = await requirePublication("editor");
  const [rows, tagList] = await Promise.all([
    db
      .select({
        id: automations.id,
        name: automations.name,
        trigger: automations.trigger,
        active: automations.active,
        tag: tags.name,
        steps: sql<number>`(select count(*)::int from ${automationSteps} s where s.automation_id = ${automations.id})`,
        inProgress: sql<number>`(select count(*)::int from ${automationRuns} r where r.automation_id = ${automations.id} and r.status = 'active')`,
        finished: sql<number>`(select count(*)::int from ${automationRuns} r where r.automation_id = ${automations.id} and r.status = 'done')`,
      })
      .from(automations)
      .leftJoin(tags, eq(tags.id, automations.triggerTagId))
      .where(eq(automations.publicationId, publication.id))
      .orderBy(asc(automations.createdAt)),
    listTags(publication.id),
  ]);

  return (
    <div className="space-y-6">
      {rows.length ? (
        <ul className="divide-y rounded-xl border">
          {rows.map((a) => (
            <li key={a.id}>
              <Link
                href={`/dashboard/automations/${a.id}`}
                className="hover:bg-muted/40 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{a.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {a.trigger === "tag_added"
                      ? `When a subscriber gets the tag “${a.tag ?? "?"}”`
                      : TRIGGERS[a.trigger as Trigger]}
                    {` · ${a.steps} ${a.steps === 1 ? "email" : "emails"}`}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground tabular-nums">
                    {`${a.inProgress} in progress · ${a.finished} finished`}
                  </span>
                  <span
                    className={
                      a.active
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                        : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium"
                    }
                  >
                    {a.active ? "On" : "Off"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No automations yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            A welcome series is a great start: a hello right away, your best posts after a few days,
            and a question a week later.
          </p>
        </div>
      )}
      <NewAutomationForm tags={tagList.map((t) => t.name)} />
    </div>
  );
}
