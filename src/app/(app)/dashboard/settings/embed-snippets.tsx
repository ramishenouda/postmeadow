"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Copy-paste signup forms for the writer's own website. */
export function EmbedSnippets({ origin, slug }: { origin: string; slug: string }) {
  const iframe = `<iframe src="${origin}/embed/${slug}" width="100%" height="150" style="border:0;max-width:480px" title="Subscribe" loading="lazy"></iframe>`;
  const form = [
    `<form action="${origin}/api/subscribe/${slug}" method="post">`,
    `  <input type="email" name="email" placeholder="you@example.com" required>`,
    `  <input type="text" name="website" tabindex="-1" autocomplete="off" style="display:none">`,
    `  <button type="submit">Subscribe</button>`,
    `</form>`,
  ].join("\n");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signup form for your website</CardTitle>
        <CardDescription>
          Paste one of these into your site. New readers confirm by email, like on your page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Snippet
          label="Ready-made form"
          hint="Styled with your branding. Works anywhere you can add HTML."
          code={iframe}
        />
        <Snippet
          label="Plain HTML form"
          hint="Unstyled, so it matches your site. After subscribing, readers see a “check your inbox” page here. To tag people who sign up with it, add <input type='hidden' name='tag' value='your-tag'> (the tag must already exist)."
          code={form}
        />
      </CardContent>
    </Card>
  );
}

function Snippet({ label, hint, code }: { label: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-muted/40 overflow-x-auto rounded-lg border p-3 text-xs leading-5">
        <code>{code}</code>
      </pre>
    </div>
  );
}
