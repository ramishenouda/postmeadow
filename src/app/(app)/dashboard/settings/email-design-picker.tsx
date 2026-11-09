"use client";

import { useState } from "react";
import { EmailThumb } from "@/components/email-thumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EMAIL_DESIGNS, type EmailDesign } from "@/lib/email-designs";
import { cn } from "@/lib/utils";

/** Pick the layout every issue uses. Thumbnails are real emails with your saved name and colour. */
export function EmailDesignPicker({ initial, error }: { initial: string; error?: string }) {
  const [design, setDesign] = useState<string>(initial || "classic");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email design</CardTitle>
        <CardDescription>
          The look of every issue, shown with your name and colour (after you save). A post can also
          use its own design: pick it in the editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <input type="hidden" name="emailDesign" value={design} />
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="radiogroup"
          aria-label="Email design"
        >
          {(Object.keys(EMAIL_DESIGNS) as EmailDesign[]).map((id) => (
            <div
              key={id}
              className={cn(
                "hover:border-primary/40 relative flex flex-col overflow-hidden rounded-xl border transition",
                design === id && "border-primary ring-primary shadow-md ring-2",
              )}
            >
              <EmailThumb
                src={`/previews/mine?design=${id}`}
                title={`${EMAIL_DESIGNS[id].name} preview`}
                className="h-48 border-b"
                scale={0.45}
              />
              <div className="space-y-1 p-3">
                <p className="text-sm font-medium">{EMAIL_DESIGNS[id].name}</p>
                <p className="text-muted-foreground text-xs">{EMAIL_DESIGNS[id].description}</p>
              </div>
              {/* The whole card is the radio button. */}
              <button
                type="button"
                role="radio"
                aria-checked={design === id}
                aria-label={EMAIL_DESIGNS[id].name}
                onClick={() => setDesign(id)}
                className="focus-visible:ring-ring absolute inset-0 rounded-xl focus-visible:ring-2"
              />
            </div>
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
