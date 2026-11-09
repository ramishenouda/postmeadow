"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pausePublication, unpausePublication } from "./actions";

/** Pause (with a reason the writer will see) or resume a publication's sending. */
export function PauseButton({ id, paused }: { id: string; paused: boolean }) {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  if (paused) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => unpausePublication(id))}
      >
        Resume
      </Button>
    );
  }
  if (!asking) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
        Pause…
      </Button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => pausePublication(id, reason));
      }}
    >
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (the writer sees this)"
        className="h-8 w-56 text-xs"
        autoFocus
      />
      <Button size="sm" variant="destructive" type="submit" disabled={pending}>
        Pause
      </Button>
    </form>
  );
}
