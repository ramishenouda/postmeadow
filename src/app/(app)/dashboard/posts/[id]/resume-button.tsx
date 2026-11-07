"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resumeSend } from "../actions";

export function ResumeButton({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => void (await resumeSend(postId)))}
    >
      {pending ? "Resuming…" : "Resume sending"}
    </Button>
  );
}
