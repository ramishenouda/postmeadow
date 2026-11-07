"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSubscriber, type AddSubscriberState } from "./actions";

export function AddSubscriberForm() {
  const [state, formAction, pending] = useActionState<AddSubscriberState, FormData>(
    addSubscriber,
    {},
  );

  return (
    <form action={formAction} className="space-y-2 rounded-xl border p-4">
      <label htmlFor="add-email" className="text-sm font-medium">
        Add a subscriber
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="add-email"
          name="email"
          type="email"
          placeholder="reader@example.com"
          required
          defaultValue={state.error ? state.email : undefined}
          aria-invalid={Boolean(state.error)}
          className="h-9 sm:max-w-sm"
        />
        <Button type="submit" className="h-9" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          {state.ok
            ? "Added. They'll get your next post."
            : "Added as confirmed, so only add people who asked to hear from you."}
        </p>
      )}
    </form>
  );
}
