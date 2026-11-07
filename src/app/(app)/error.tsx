"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        The page couldn&apos;t load. Try again, and if it keeps happening, check the server logs
        {error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
