"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribe, type SubscribeState } from "./actions";

export function SubscribeForm({
  slug,
  topics = [],
  postSlug,
  hiddenTags = [],
  buttonText,
}: {
  slug: string;
  /** Public topics the reader can pick (tags the writer made public). */
  topics?: { id: string; name: string }[];
  /** The post page this form is on, so the writer sees which posts bring readers. */
  postSlug?: string;
  /** Tags every sign-up from this form gets (a landing page's campaign tag). */
  hiddenTags?: string[];
  buttonText?: string | null;
}) {
  // A reader's referral link: /{slug}?ref=CODE
  const ref = useSearchParams().get("ref");
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
        {postSlug ? <input type="hidden" name="post" value={postSlug} /> : null}
        {ref ? <input type="hidden" name="ref" value={ref.slice(0, 20)} /> : null}
        {hiddenTags.map((t) => (
          <input key={t} type="hidden" name="tag" value={t} />
        ))}
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
          {pending ? "Subscribing…" : buttonText || "Subscribe"}
        </Button>
      </div>
      {topics.length ? (
        <fieldset className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <legend className="text-muted-foreground float-left mr-1">I&apos;m interested in:</legend>
          {topics.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 has-checked:border-(--accent)"
            >
              <input type="checkbox" name="tag" value={t.name} defaultChecked />
              {t.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      {state.status === "error" ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
