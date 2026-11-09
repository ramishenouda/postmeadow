"use client";

import { useActionState } from "react";
import { sendPaidLoginLink, type LoginLinkState } from "@/app/[slug]/upgrade/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "Already a paid subscriber? Email me a link" for a new browser or device. */
export function PaidLoginForm({ slug, next }: { slug: string; next: string }) {
  const [state, action, pending] = useActionState<LoginLinkState, FormData>(
    sendPaidLoginLink.bind(null, slug, next),
    { status: "idle" },
  );
  if (state.status === "sent") {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        If that address has a paid subscription, a link to read is on its way.
      </p>
    );
  }
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground cursor-pointer">Already a paid subscriber?</summary>
      <form action={action} className="mx-auto mt-3 flex max-w-sm gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Your email"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Email me a link
        </Button>
      </form>
    </details>
  );
}
