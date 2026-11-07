"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importSubscribers, type ImportState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importSubscribers, {});

  if (state.result) {
    const { added, existing, invalid, invalidSamples } = state.result;
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="text-lg font-medium" role="status">
            Imported {added.toLocaleString("en")} {added === 1 ? "subscriber" : "subscribers"}
          </p>
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
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span>
              Everyone on this list agreed to receive emails from me. They&apos;ll be added as
              confirmed, without a confirmation email.
            </span>
          </label>
          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
