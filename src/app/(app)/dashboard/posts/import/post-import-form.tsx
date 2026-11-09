"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Source = "substack" | "ghost" | "feed";
type Result =
  | { ok: true; found: number; imported: number; skipped: number; drafts: number; hidden: number }
  | { ok: false; error: string };

const SOURCES: { id: Source; name: string; how: string }[] = [
  {
    id: "substack",
    name: "Substack",
    how: "In Substack: Settings → Exports → Create new export. Upload the ZIP file it emails you.",
  },
  {
    id: "ghost",
    name: "Ghost",
    how: "In Ghost: Settings → Advanced → Import/Export → Export your content. Upload the .json file.",
  },
  {
    id: "feed",
    name: "beehiiv, WordPress & others",
    how: "Paste your RSS feed's address (beehiiv: Settings → Publication → RSS feed, with full content on; WordPress: yoursite.com/feed). Feeds usually include your latest 20–50 posts.",
  },
];

export function PostImportForm() {
  const [source, setSource] = useState<Source>("substack");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const info = SOURCES.find((s) => s.id === source)!;

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setResult(null);
        const body = new FormData(e.currentTarget);
        body.set("source", source);
        try {
          const res = await fetch("/api/import", { method: "POST", body });
          const json = await res.json().catch(() => ({ error: "The import failed." }));
          setResult(
            res.ok
              ? { ok: true, ...json }
              : { ok: false, error: json.error ?? "The import failed." },
          );
        } catch {
          setResult({ ok: false, error: "Couldn't reach the server. Check your connection." });
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">From</legend>
        {SOURCES.map((s) => (
          <label
            key={s.id}
            className={cn(
              "cursor-pointer rounded-xl border p-3 text-sm font-medium",
              source === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            <input
              type="radio"
              name="from"
              value={s.id}
              checked={source === s.id}
              onChange={() => setSource(s.id)}
              className="sr-only"
            />
            {s.name}
          </label>
        ))}
      </fieldset>

      <p className="text-muted-foreground text-sm">{info.how}</p>

      {source === "feed" ? (
        <div className="space-y-1.5">
          <Label htmlFor="imp-url">Feed address</Label>
          <Input id="imp-url" name="url" type="url" placeholder="https://rss.beehiiv.com/feeds/…" />
          <p className="text-muted-foreground text-xs">Or upload the feed file instead:</p>
          <Input name="file" type="file" accept=".xml,.rss,.atom,application/xml,text/xml" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="imp-file">
            {source === "substack" ? "Substack export (.zip)" : "Ghost export (.json)"}
          </Label>
          <Input
            id="imp-file"
            name="file"
            type="file"
            required
            accept={source === "substack" ? ".zip,application/zip" : ".json,application/json"}
          />
        </div>
      )}

      {source === "ghost" ? (
        <div className="space-y-1.5">
          <Label htmlFor="imp-site">Your Ghost site&apos;s address</Label>
          <Input id="imp-site" name="siteUrl" type="url" placeholder="https://yourblog.com" />
          <p className="text-muted-foreground text-xs">
            Ghost exports leave this out of links and images. Without it, images won&apos;t show.
          </p>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Add them</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mode" value="archive" defaultChecked className="mt-1" />
          <span>
            To my web archive, with their original dates
            <span className="text-muted-foreground block text-xs">
              Published posts appear on your page straight away. Members-only and paid posts are
              kept off the web. Nothing is emailed.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mode" value="drafts" className="mt-1" />
          <span>As drafts, so I can check them first</span>
        </label>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import posts"}
      </Button>

      {result ? (
        result.ok ? (
          <div
            role="status"
            className="space-y-1 rounded-xl border border-emerald-600/20 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <p className="font-medium">
              {`Imported ${result.imported} of ${result.found} ${result.found === 1 ? "post" : "posts"}.`}
            </p>
            {result.skipped ? (
              <p>{`${result.skipped} skipped (already imported, or empty).`}</p>
            ) : null}
            {result.drafts ? <p>{`${result.drafts} added as drafts.`}</p> : null}
            {result.hidden ? (
              <p>{`${result.hidden} members-only or paid posts are kept off the web.`}</p>
            ) : null}
            <p>
              <Link href="/dashboard/posts" className="underline">
                See your posts
              </Link>
            </p>
          </div>
        ) : (
          <p role="alert" className="text-destructive text-sm">
            {result.error}
          </p>
        )
      ) : null}
    </form>
  );
}
