"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribe, type SubscribeState } from "./actions";

export function SubscribeForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState<SubscribeState, FormData>(
    subscribe.bind(null, slug),
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <div className="bg-muted/40 rounded-lg border p-4 text-sm" role="status">
        <p className="font-medium">Almost there. Check your inbox.</p>
        <p className="text-muted-foreground mt-1">
          Click the link in the email we just sent{state.email ? ` to ${state.email}` : ""} to
          confirm your subscription.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="subscribe-email" className="sr-only">
          Email address
        </label>
        <Input
          id="subscribe-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          defaultValue={state.status === "error" ? state.email : undefined}
          aria-invalid={state.status === "error"}
          className="h-10 sm:flex-1"
        />
        {/* Honeypot, hidden from people and assistive tech. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <Button
          type="submit"
          className="h-10 bg-(--accent) px-4 text-white hover:bg-(--accent)/90"
          disabled={pending}
        >
          {pending ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      {state.status === "error" ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
