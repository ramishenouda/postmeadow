"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importSubscribers, type ImportState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importSubscribers, {});
  const [mode, setMode] = useState<"subscribed" | "invite">("subscribed");

  if (state.result) {
    const { mode: done, added, existing, invalid, invalidSamples } = state.result;
    const people = `${added.toLocaleString("en")} ${added === 1 ? "person" : "people"}`;
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-lg font-medium" role="status">
            {done === "invited"
              ? `Sending invitations to ${people}`
              : `Imported ${added.toLocaleString("en")} ${added === 1 ? "subscriber" : "subscribers"}`}
          </p>
          {done === "invited" ? (
            <p className="text-muted-foreground text-sm">
              They&apos;re listed as Invited until they answer. Invitations nobody answers expire
              after 7 days.
            </p>
          ) : null}
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>{existing.toLocaleString("en")} already on your list (skipped)</li>
            <li>
              {invalid.toLocaleString("en")} invalid
              {invalidSamples.length ? `, e.g. ${invalidSamples.join(", ")}` : ""}
            </li>
          </ul>
          <div className="flex gap-2">
            <Link href="/dashboard/subscribers" className={buttonVariants()}>
              View subscribers
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="file">CSV file</Label>
            <Input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pasted">Or paste addresses</Label>
            <Textarea
              id="pasted"
              name="pasted"
              rows={6}
              placeholder={"ada@example.com\ngrace@example.com"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (optional)</Label>
            <Input
              id="tags"
              name="tags"
              placeholder="e.g. customers, spring-fair"
              maxLength={300}
            />
            <p className="text-muted-foreground text-xs">
              Everyone in this import gets these tags, including people already on your list. Use
              them to send to just this group later.
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">How should they be added?</legend>
            {(
              [
                [
                  "subscribed",
                  "They already subscribed",
                  "For a list you're bringing from another service. They're added straight away, with no email.",
                ],
                [
                  "invite",
                  "Send them an invitation",
                  "Each person gets an email to accept or decline. Only those who accept are subscribed.",
                ],
              ] as const
            ).map(([value, title, body]) => (
              <label
                key={value}
                className="has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="text-muted-foreground">{body}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {mode === "subscribed" ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>
                Everyone on this list agreed to receive emails from me. They&apos;ll be added as
                confirmed, without a confirmation email.
              </span>
            </label>
          ) : null}
          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Importing…" : mode === "invite" ? "Import and invite" : "Import"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
