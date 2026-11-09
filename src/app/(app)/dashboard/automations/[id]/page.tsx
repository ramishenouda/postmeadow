import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { automations, automationSteps, posts, tags } from "@/db/schema";
import { runCounts, stepStats } from "@/lib/automations";
import { requirePublication } from "@/lib/dal";
import { listTags } from "@/lib/tags";
import {
  ActiveToggle,
  AddStepButton,
  AutomationSettings,
  DeleteAutomationButton,
  StepControls,
} from "../automation-forms";

export const metadata: Metadata = { title: "Automation" };

type Props = PageProps<"/dashboard/automations/[id]">;

export default function AutomationPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
      <Automation params={params} />
    </Suspense>
  );
}

const describeDelay = (hours: number, first: boolean) => {
  if (hours === 0) return first ? "Right away" : "Straight after the previous email";
  const unit =
    hours % 24 === 0
      ? `${hours / 24} ${hours === 24 ? "day" : "days"}`
      : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return first ? `${unit} after it starts` : `${unit} after the previous email`;
};

async function Automation({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const { publication } = await requirePublication("editor");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [automation] = await db
    .select({
      id: automations.id,
      name: automations.name,
      trigger: automations.trigger,
      active: automations.active,
      tag: tags.name,
    })
    .from(automations)
    .leftJoin(tags, eq(tags.id, automations.triggerTagId))
    .where(and(eq(automations.id, id), eq(automations.publicationId, publication.id)));
  if (!automation) notFound();

  const steps = await db
    .select({
      id: automationSteps.id,
      delayHours: automationSteps.delayHours,
      postId: posts.id,
      subject: posts.title,
    })
    .from(automationSteps)
    .innerJoin(posts, eq(posts.id, automationSteps.postId))
    .where(eq(automationSteps.automationId, id))
    .orderBy(asc(automationSteps.position));
  const [stats, runs, tagList] = await Promise.all([
    stepStats(steps.map((s) => s.postId)),
    runCounts(id),
    listTags(publication.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link
          href="/dashboard/automations"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Automations
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{automation.name}</h1>
          <ActiveToggle id={automation.id} active={automation.active} />
        </div>
        <p className="text-muted-foreground text-sm">
          {`${runs.active} in progress · ${runs.done} finished · ${runs.stopped} left (unsubscribed)`}
        </p>
      </div>

      <AutomationSettings
        id={automation.id}
        name={automation.name}
        trigger={automation.trigger}
        tag={automation.tag ?? ""}
        tags={tagList.map((t) => t.name)}
      />

      <section className="space-y-3" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="font-medium">
          Emails
        </h2>
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const st = stats.get(s.postId);
            const rate = (n: number) =>
              st?.sent ? `${Math.round((n / st.sent) * 1000) / 10}%` : "–";
            return (
              <li key={s.id} className="rounded-xl border">
                <div className="text-muted-foreground border-b px-4 py-2 text-xs">
                  {describeDelay(s.delayHours, i === 0)}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">Email {i + 1}</p>
                    <Link
                      href={`/dashboard/posts/${s.postId}`}
                      className="font-medium hover:underline"
                    >
                      {s.subject || "Untitled"}
                    </Link>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {`${(st?.sent ?? 0).toLocaleString("en")} sent · ${rate(st?.opened ?? 0)} opened · ${rate(st?.clicked ?? 0)} clicked`}
                    </p>
                  </div>
                  <StepControls
                    stepId={s.id}
                    postId={s.postId}
                    delayHours={s.delayHours}
                    first={i === 0}
                    last={i === steps.length - 1}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <AddStepButton automationId={automation.id} />
      </section>

      <div className="border-t pt-6">
        <DeleteAutomationButton id={automation.id} />
      </div>
    </div>
  );
}
