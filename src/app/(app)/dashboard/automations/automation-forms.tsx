"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addStep,
  createAutomation,
  deleteAutomation,
  deleteStep,
  moveStep,
  setAutomationActive,
  setStepDelay,
  updateAutomation,
  type AutomationResult,
} from "./actions";

function useResult() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AutomationResult | null>(null);
  const run = (action: () => Promise<AutomationResult | void>) =>
    startTransition(async () => {
      const r = await action();
      if (r) setResult(r);
    });
  const message = result ? (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm text-emerald-700" : "text-destructive text-sm"}
    >
      {result.ok ? result.message : result.error}
    </p>
  ) : null;
  return { pending, run, message };
}

function TriggerFields({
  trigger,
  setTrigger,
  tag,
  tags,
}: {
  trigger: string;
  setTrigger: (t: string) => void;
  tag: string;
  tags: string[];
}) {
  const listId = useId();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${listId}-trigger`}>Starts</Label>
        <select
          id={`${listId}-trigger`}
          name="trigger"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          className="bg-background h-8 rounded-lg border px-2.5 text-sm"
        >
          <option value="subscribed">When someone subscribes</option>
          <option value="tag_added">When a subscriber gets a tag</option>
        </select>
      </div>
      {trigger === "tag_added" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${listId}-tag`}>Tag</Label>
          <Input
            id={`${listId}-tag`}
            name="tag"
            defaultValue={tag}
            list={listId}
            required
            maxLength={40}
            placeholder="course"
            className="w-44"
          />
          <datalist id={listId}>
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      ) : null}
    </div>
  );
}

export function NewAutomationForm({ tags }: { tags: string[] }) {
  const { pending, run, message } = useResult();
  const [trigger, setTrigger] = useState("subscribed");
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() =>
          createAutomation(String(f.get("name") ?? ""), trigger, String(f.get("tag") ?? "")),
        );
      }}
    >
      <h2 className="font-medium">New automation</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="auto-name">Name</Label>
          <Input id="auto-name" name="name" required maxLength={80} placeholder="Welcome series" />
        </div>
        <TriggerFields trigger={trigger} setTrigger={setTrigger} tag="" tags={tags} />
        <Button type="submit" disabled={pending}>
          Create
        </Button>
      </div>
      {message}
    </form>
  );
}

export function AutomationSettings({
  id,
  name,
  trigger: initialTrigger,
  tag,
  tags,
}: {
  id: string;
  name: string;
  trigger: string;
  tag: string;
  tags: string[];
}) {
  const { pending, run, message } = useResult();
  const [trigger, setTrigger] = useState(initialTrigger);
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() =>
          updateAutomation(id, {
            name: String(f.get("name") ?? ""),
            trigger,
            tag: String(f.get("tag") ?? ""),
          }),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="auto-edit-name">Name</Label>
          <Input id="auto-edit-name" name="name" defaultValue={name} required maxLength={80} />
        </div>
        <TriggerFields trigger={trigger} setTrigger={setTrigger} tag={tag} tags={tags} />
        <Button type="submit" variant="outline" disabled={pending}>
          Save
        </Button>
      </div>
      {message}
    </form>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { pending, run, message } = useResult();
  return (
    <div className="space-y-1 text-right">
      <Button
        variant={active ? "outline" : "default"}
        disabled={pending}
        onClick={() => run(() => setAutomationActive(id, !active))}
      >
        {active ? "Pause automation" : "Turn on"}
      </Button>
      {message}
    </div>
  );
}

export function AddStepButton({ automationId }: { automationId: string }) {
  const { pending, run, message } = useResult();
  return (
    <div className="space-y-1">
      <Button variant="outline" disabled={pending} onClick={() => run(() => addStep(automationId))}>
        Add an email
      </Button>
      {message}
    </div>
  );
}

const DELAYS = [0, 1, 6, 12, 24, 48, 72, 120, 168, 336, 720];
const delayLabel = (h: number) =>
  h === 0
    ? "No wait"
    : h < 24
      ? `${h} ${h === 1 ? "hour" : "hours"}`
      : `${h / 24} ${h === 24 ? "day" : "days"}`;

export function StepControls({
  stepId,
  postId,
  delayHours,
  first,
  last,
}: {
  stepId: string;
  postId: string;
  delayHours: number;
  first: boolean;
  last: boolean;
}) {
  const { pending, run, message } = useResult();
  const options = DELAYS.includes(delayHours)
    ? DELAYS
    : [...DELAYS, delayHours].sort((a, b) => a - b);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          Wait
          <select
            value={delayHours}
            disabled={pending}
            onChange={(e) => run(() => setStepDelay(stepId, Number(e.target.value)))}
            className="bg-background text-foreground h-8 rounded-md border px-2 text-sm"
            aria-label="Wait before this email"
          >
            {options.map((h) => (
              <option key={h} value={h}>
                {delayLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <Link
          href={`/dashboard/posts/${postId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit email
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending || first}
          aria-label="Move up"
          onClick={() => run(() => moveStep(stepId, "up"))}
        >
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending || last}
          aria-label="Move down"
          onClick={() => run(() => moveStep(stepId, "down"))}
        >
          <ArrowDown className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label="Remove this email"
          onClick={() => {
            if (confirm("Remove this email from the automation? Its stats are deleted too.")) {
              run(() => deleteStep(stepId));
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {message}
    </div>
  );
}

export function DeleteAutomationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this automation and its emails? People in it stop getting them.")) {
          startTransition(async () => void (await deleteAutomation(id)));
        }
      }}
    >
      Delete automation
    </Button>
  );
}
