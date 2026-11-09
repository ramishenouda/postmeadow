"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inviteAgain } from "./actions";

/** On an expired invitation: send a fresh one (limited per address, see MAX_INVITES). */
export function InviteAgainButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await inviteAgain(id);
            setError(result.ok ? null : (result.error ?? "Something went wrong."));
          })
        }
      >
        {pending ? "Sending…" : "Invite again"}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive max-w-56 text-right text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
