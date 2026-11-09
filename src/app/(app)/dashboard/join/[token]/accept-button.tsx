"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptTeamInvite } from "../../team/actions";

export function AcceptButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptTeamInvite(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Accept and open the dashboard
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
