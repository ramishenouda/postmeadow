"use client";

import { Heart } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { comment, like, type CommentFormState } from "./actions";

export function LikeButton({
  slug,
  postSlug,
  initialLiked,
  initialCount,
}: {
  slug: string;
  postSlug: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={state.liked}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Show it right away; settle on the server's answer.
          setState((s) => ({ liked: !s.liked, count: s.count + (s.liked ? -1 : 1) }));
          const result = await like(slug, postSlug);
          if (result) setState(result);
        })
      }
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
        state.liked
          ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
          : "hover:border-(--accent)/40",
      )}
    >
      <Heart className={cn("size-4", state.liked && "fill-current")} aria-hidden />
      <span className="tabular-nums">{state.count.toLocaleString("en")}</span>
      <span className="sr-only">{state.liked ? "Unlike" : "Like"}</span>
    </button>
  );
}

export function CommentForm({
  slug,
  postSlug,
  remembered,
}: {
  slug: string;
  postSlug: string;
  remembered: boolean;
}) {
  const [state, action, pending] = useActionState<CommentFormState, FormData>(
    comment.bind(null, slug, postSlug),
    { status: "idle" },
  );
  // A fresh, empty form after each published comment.
  const [key, setKey] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "published") setKey((k) => k + 1);
  }

  if (state.status === "confirm") {
    return (
      <div className="bg-muted/40 rounded-xl border p-4 text-sm" role="status">
        <p className="font-medium">Check your inbox to publish your comment.</p>
        <p className="text-muted-foreground mt-1">
          We sent a link to {state.email}. You only need to do this once.
        </p>
      </div>
    );
  }

  return (
    <form key={key} action={action} className="space-y-3 rounded-xl border p-4">
      <label htmlFor="comment-body" className="sr-only">
        Your comment
      </label>
      <textarea
        id="comment-body"
        name="body"
        required
        maxLength={2000}
        rows={3}
        placeholder="Add a comment…"
        className="focus-visible:ring-ring/50 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" required maxLength={60} placeholder="Your name" aria-label="Your name" />
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Your email (not shown)"
        />
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="hidden"
        />
        <Button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-(--accent) text-white hover:bg-(--accent)/90"
        >
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {remembered
          ? "Your email isn't shown. Use the same address as before to post straight away."
          : "Your email isn't shown. The first time, we send you a link to confirm it's you."}
      </p>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : state.status === "published" ? (
        <p role="status" className="text-sm text-emerald-700">
          Comment posted.
        </p>
      ) : null}
    </form>
  );
}
