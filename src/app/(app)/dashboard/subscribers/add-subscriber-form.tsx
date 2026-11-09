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
        Invite a subscriber
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
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          {state.ok
            ? `Invitation sent to ${state.email}. They're subscribed once they accept.`
            : "We'll email them an invitation to accept or decline. Unanswered invitations expire after 7 days."}
        </p>
      )}
    </form>
  );
}
