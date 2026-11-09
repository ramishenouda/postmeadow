"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteComment, pickAbWinner, replyAsAuthor, resendToNonOpeners } from "../actions";

type Result = { ok: true; message: string } | { ok: false; error: string };

function useAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const run = (action: () => Promise<Result>) =>
    startTransition(async () => setResult(await action()));
  const message = result ? (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm text-emerald-700" : "text-destructive text-sm"}
    >
      {result.ok ? result.message : result.error}
    </p>
  ) : null;
  return { pending, run, message };
}

/** "Send A now" / "Send B now": end an A/B test early. */
export function PickWinnerButtons({ postId }: { postId: string }) {
  const { pending, run, message } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(["a", "b"] as const).map((v) => (
          <Button
            key={v}
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => pickAbWinner(postId, v))}
          >
            Send {v.toUpperCase()} to everyone now
          </Button>
        ))}
      </div>
      {message}
    </div>
  );
}

/** Resend to people who didn't open, with a new subject line. */
export function ResendForm({
  postId,
  title,
  nonOpeners,
}: {
  postId: string;
  title: string;
  nonOpeners: number;
}) {
  const { pending, run, message } = useAction();
  const [subject, setSubject] = useState(`In case you missed it: ${title}`);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => resendToNonOpeners(postId, subject));
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Resend subject"
          maxLength={200}
          required
          className="min-w-0 flex-1 sm:min-w-80"
        />
        <Button type="submit" disabled={pending || nonOpeners === 0}>
          Resend to {nonOpeners.toLocaleString("en")}
        </Button>
      </div>
      {message}
    </form>
  );
}

export function DeleteCommentButton({ postId, commentId }: { postId: string; commentId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground h-7 px-2 text-xs"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this comment?")) return;
        startTransition(async () => void (await deleteComment(postId, commentId)));
      }}
    >
      Delete
    </Button>
  );
}

export function AuthorReplyForm({ postId }: { postId: string }) {
  const { pending, run, message } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const result = await replyAsAuthor(postId, body);
          if (result.ok) setBody("");
          return result;
        });
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Reply as the author"
        placeholder="Reply as the author…"
        maxLength={2000}
        rows={2}
        className="focus-visible:ring-ring/50 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3"
      />
      <Button type="submit" size="sm" disabled={pending || !body.trim()}>
        Post reply
      </Button>
      {message}
    </form>
  );
}
