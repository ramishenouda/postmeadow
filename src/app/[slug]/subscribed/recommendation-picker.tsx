"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { subscribeRecommended, type RecommendState } from "./actions";

type Item = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  note: string | null;
};

export function RecommendationPicker({
  from,
  proof,
  items,
}: {
  from: string;
  proof: string;
  slug: string;
  items: Item[];
}) {
  const [state, action, pending] = useActionState<RecommendState, FormData>(
    subscribeRecommended.bind(null, proof),
    { status: "idle" },
  );

  if (state.status === "done") {
    return (
      <p
        role="status"
        className="rounded-xl border bg-emerald-50 p-4 text-center text-sm text-emerald-800"
      >
        {state.count
          ? `Done: you're subscribed to ${state.count} more ${state.count === 1 ? "newsletter" : "newsletters"}.`
          : "You were already subscribed to those."}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{`${from} recommends`}</h2>
        <p className="text-muted-foreground text-sm">
          Tick any you&apos;d like. You&apos;re subscribed straight away, and you can unsubscribe
          from each one any time.
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id}>
            <label className="hover:bg-muted/40 flex cursor-pointer gap-3 rounded-xl border p-3 has-checked:border-(--accent)">
              <input type="checkbox" name="publication" value={r.id} className="mt-1" />
              <span className="min-w-0">
                <span className="block font-medium">{r.name}</span>
                {r.note || r.description ? (
                  <span className="text-muted-foreground block text-sm">
                    {r.note ? `“${r.note}”` : r.description}
                  </span>
                ) : null}
                <a
                  href={`/${r.slug}`}
                  target="_blank"
                  className="text-muted-foreground text-xs underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Read it first
                </a>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="bg-(--accent) text-white hover:bg-(--accent)/90"
      >
        Subscribe to the ones I ticked
      </Button>
    </form>
  );
}
