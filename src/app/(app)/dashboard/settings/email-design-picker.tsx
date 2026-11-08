"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EMAIL_DESIGNS, type EmailDesign } from "@/lib/email-designs";
import { cn } from "@/lib/utils";

/** Pick the layout every issue uses. Thumbnails are sketches; the editor's preview is exact. */
export function EmailDesignPicker({
  initial,
  accent,
  error,
}: {
  initial: string;
  accent: string;
  error?: string;
}) {
  const [design, setDesign] = useState<string>(initial || "classic");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email design</CardTitle>
        <CardDescription>
          The layout of every issue. See it with your own post in the editor&apos;s “Email preview”
          tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <input type="hidden" name="emailDesign" value={design} />
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="radiogroup"
          aria-label="Email design"
        >
          {(Object.keys(EMAIL_DESIGNS) as EmailDesign[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={design === id}
              onClick={() => setDesign(id)}
              className={cn(
                "hover:bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                design === id && "border-foreground ring-foreground ring-1",
              )}
            >
              <Thumb design={id} accent={accent} />
              <span className="text-sm font-medium">{EMAIL_DESIGNS[id].name}</span>
              <span className="text-muted-foreground text-xs">{EMAIL_DESIGNS[id].description}</span>
            </button>
          ))}
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** A tiny sketch of each layout. */
function Thumb({ design, accent }: { design: EmailDesign; accent: string }) {
  const line = (w: string, extra = "") => (
    <div className={cn("h-1 rounded-full bg-stone-200", extra)} style={{ width: w }} />
  );
  const body = (
    <div className="space-y-1">
      {line("100%")}
      {line("92%")}
      {line("80%")}
    </div>
  );
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-28 flex-col gap-2 overflow-hidden rounded-md border p-2.5",
        design === "letter" ? "bg-stone-100" : "bg-white",
      )}
    >
      {design === "classic" ? (
        <>
          <div className="flex justify-between">
            {line("30%", "bg-stone-400")}
            {line("20%")}
          </div>
          <div className="h-2 w-3/4 rounded-sm bg-stone-700" />
          <div className="border-t border-stone-200" />
          {body}
        </>
      ) : null}
      {design === "minimal" ? (
        <div className="mx-auto w-4/5 space-y-2 pt-1">
          {line("25%")}
          <div className="h-2 w-2/3 rounded-sm bg-stone-700" />
          {body}
        </div>
      ) : null}
      {design === "letter" ? (
        <div className="space-y-1.5 rounded-sm border border-stone-200 bg-white p-2">
          {line("35%")}
          <div className="h-1.5 w-1/2 rounded-sm bg-stone-600" />
          {body}
          <div className="h-1 w-1/4 rounded-full bg-stone-400" />
        </div>
      ) : null}
      {design === "magazine" ? (
        <>
          <div className="-mx-2.5 -mt-2.5 h-4" style={{ backgroundColor: accent }} />
          <div className="h-2.5 w-4/5 rounded-sm bg-stone-800" />
          <div className="h-0.5 w-1/6 rounded-full" style={{ backgroundColor: accent }} />
          {body}
        </>
      ) : null}
    </div>
  );
}
