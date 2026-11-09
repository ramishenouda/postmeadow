"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Summary = {
  link: string;
  referred: number;
  rewards: {
    id: string;
    threshold: number;
    name: string;
    description: string | null;
    reached: boolean;
  }[];
  next: { threshold: number; name: string } | null;
};

/** A reader's referral link, progress and rewards. */
export function ReferralCard({
  publicationName,
  summary,
}: {
  publicationName: string;
  summary: Summary;
}) {
  const [copied, setCopied] = useState(false);
  const { link, referred, rewards, next } = summary;
  const share = `I read ${publicationName} and think you'd like it too:`;
  return (
    <section
      id="refer"
      aria-labelledby="refer-heading"
      className="space-y-4 rounded-2xl border border-(--accent)/20 bg-(--accent)/5 p-6"
    >
      <div>
        <h2 id="refer-heading" className="text-lg font-semibold tracking-tight">
          {`Share ${publicationName}`}
        </h2>
        <p className="text-muted-foreground text-sm">
          {next
            ? `Refer ${next.threshold - referred} more ${next.threshold - referred === 1 ? "friend" : "friends"} to get ${next.name}.`
            : rewards.length
              ? "You've reached every reward. Thank you!"
              : "Know someone who'd enjoy it? Send them your link."}{" "}
          {referred
            ? `So far ${referred} ${referred === 1 ? "person has" : "people have"} joined through you.`
            : ""}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          aria-label="Your referral link"
          onFocus={(e) => e.currentTarget.select()}
          className="bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard blocked; the field is selectable.
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <a
          className="underline"
          href={`mailto:?subject=${encodeURIComponent(publicationName)}&body=${encodeURIComponent(`${share} ${link}`)}`}
        >
          Email it
        </a>
        <a
          className="underline"
          target="_blank"
          rel="noopener"
          href={`https://wa.me/?text=${encodeURIComponent(`${share} ${link}`)}`}
        >
          WhatsApp
        </a>
        <a
          className="underline"
          target="_blank"
          rel="noopener"
          href={`https://x.com/intent/post?text=${encodeURIComponent(share)}&url=${encodeURIComponent(link)}`}
        >
          X
        </a>
        <a
          className="underline"
          target="_blank"
          rel="noopener"
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}
        >
          LinkedIn
        </a>
      </div>
      {rewards.length ? (
        <ol className="space-y-2">
          {rewards.map((r) => (
            <li key={r.id} className="flex items-start gap-3 text-sm">
              <span
                className={
                  r.reached
                    ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-(--accent) text-xs font-semibold text-white"
                    : "text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                }
              >
                {r.threshold}
              </span>
              <span>
                <span className="font-medium">{r.name}</span>
                {r.reached ? <span className="text-(--accent)"> · earned</span> : null}
                {r.description ? (
                  <span className="text-muted-foreground block">{r.description}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
