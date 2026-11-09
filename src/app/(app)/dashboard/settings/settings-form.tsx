"use client";

import { useActionState, useRef, useState } from "react";
import { uploadImage } from "@/components/editor/upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { accentIsReadable, contrastRatio, DEFAULT_ACCENT, HEX_COLOR } from "@/lib/color";
import { cn } from "@/lib/utils";
import { DEFAULT_WELCOME_MESSAGE, MAX_WELCOME_MESSAGE } from "@/lib/welcome-default";
import { updateSettings, type SettingsState } from "./actions";
import { EmailDesignPicker } from "./email-design-picker";

type Values = {
  name: string;
  description: string;
  fromName: string;
  replyTo: string;
  postalAddress: string;
  logoUrl: string;
  accentColor: string;
  fontStyle: string;
  /** "on" or "" (checkbox semantics, so it round-trips through the form). */
  welcomeEnabled: string;
  commentsEnabled?: string;
  welcomeMessage: string;
  emailDesign: string;
};

export function SettingsForm({ address, values }: { address: string; values: Values }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updateSettings, {});
  const errors = state.errors ?? {};
  const v = { ...values, ...state.values };

  return (
    // key: re-mount with fresh defaults after the server data changes
    <form action={formAction} className="space-y-6" key={JSON.stringify(values)}>
      <Card>
        <CardHeader>
          <CardTitle>Publication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Field id="name" label="Name" error={errors.name}>
            <Input id="name" name="name" defaultValue={v.name} maxLength={80} required />
          </Field>
          <Field id="address" label="Web address" hint="The web address can't be changed.">
            <Input id="address" value={address} readOnly disabled />
          </Field>
          <Field id="description" label="Description" error={errors.description}>
            <Textarea
              id="description"
              name="description"
              defaultValue={v.description}
              maxLength={280}
              rows={3}
            />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="fromName" label="Sender name" error={errors.fromName}>
              <Input
                id="fromName"
                name="fromName"
                defaultValue={v.fromName}
                maxLength={80}
                required
              />
            </Field>
            <Field id="replyTo" label="Reply-to email" error={errors.replyTo}>
              <Input id="replyTo" name="replyTo" type="email" defaultValue={v.replyTo} />
            </Field>
          </div>
          <Field
            id="postalAddress"
            label="Postal address"
            error={errors.postalAddress}
            hint="Shown in the footer of every email. Anti-spam laws require one, so you can't send without it. A PO box or business address works."
          >
            <Textarea
              id="postalAddress"
              name="postalAddress"
              defaultValue={v.postalAddress}
              maxLength={300}
              rows={2}
              placeholder={"Postmeadow Ltd, 1 Example Street\n10115 Berlin, Germany"}
            />
          </Field>
        </CardContent>
      </Card>

      <Branding initial={v} errors={errors} />

      <EmailDesignPicker initial={v.emailDesign} error={errors.emailDesign} />

      <Card>
        <CardHeader>
          <CardTitle>Comments and likes</CardTitle>
          <CardDescription>
            Readers can like posts on your page and comment after confirming their email address.
            You can delete any comment from the post&apos;s page in your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input type="hidden" name="commentsShown" value="1" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="commentsEnabled"
              defaultChecked={v.commentsEnabled !== ""}
            />
            Allow comments on posts
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Welcome email</CardTitle>
          <CardDescription>
            Sent once, right after a reader confirms their subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="welcomeEnabled"
              defaultChecked={v.welcomeEnabled === "on"}
            />
            Send a welcome email to new subscribers
          </label>
          <Field
            id="welcomeMessage"
            label="Message"
            hint="Markdown works: **bold**, [links](https://…), lists. Leave empty to use the default shown."
            error={errors.welcomeMessage}
          >
            <Textarea
              id="welcomeMessage"
              name="welcomeMessage"
              defaultValue={v.welcomeMessage}
              placeholder={DEFAULT_WELCOME_MESSAGE}
              maxLength={MAX_WELCOME_MESSAGE}
              rows={5}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state.ok ? (
          <span className="text-muted-foreground text-sm" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Branding({ initial, errors }: { initial: Values; errors: Record<string, string> }) {
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [accent, setAccent] = useState(initial.accentColor);
  const [font, setFont] = useState(initial.fontStyle || "sans");
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const effectiveAccent = HEX_COLOR.test(accent) ? accent : DEFAULT_ACCENT;
  const readable = !accent || accentIsReadable(accent);

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    setUploading(true);
    try {
      setLogoUrl((await uploadImage(file)).url);
    } catch (e) {
      setLogoError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Used in your emails and on your public pages.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <input type="hidden" name="logoUrl" value={logoUrl} />
        <input type="hidden" name="accentColor" value={accent} />
        <input type="hidden" name="fontStyle" value={font} />

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-14 min-w-28 items-center justify-center rounded-lg border bg-white px-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded logo
                <img src={logoUrl} alt="Logo preview" className="max-h-10 w-auto" />
              ) : (
                <span className="text-muted-foreground text-xs">No logo</span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload logo"}
            </Button>
            {logoUrl ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl("")}>
                Remove
              </Button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => void uploadLogo(e.target.files?.[0])}
            />
          </div>
          <p
            className={cn(
              "text-sm",
              logoError || errors.logoUrl ? "text-destructive" : "text-muted-foreground",
            )}
            role={logoError || errors.logoUrl ? "alert" : undefined}
          >
            {logoError ??
              errors.logoUrl ??
              "Shown 40px tall at the top of emails. A wide PNG with a transparent background works best."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accent-hex">Accent colour</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Pick accent colour"
              value={effectiveAccent}
              onChange={(e) => setAccent(e.target.value)}
              className="bg-background h-9 w-12 cursor-pointer rounded-md border p-1"
            />
            <Input
              id="accent-hex"
              value={accent}
              onChange={(e) => setAccent(e.target.value.trim())}
              placeholder={`${DEFAULT_ACCENT} (default)`}
              className="h-9 w-40 font-mono"
              aria-invalid={!readable || Boolean(errors.accentColor)}
            />
            {accent ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAccent("")}>
                Use default
              </Button>
            ) : null}
          </div>
          {/* Live sample, so the writer sees exactly what readers get. */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-3 text-sm text-stone-800">
            <span>
              A sentence with{" "}
              <span className="underline" style={{ color: effectiveAccent }}>
                a link
              </span>
              .
            </span>
            <span
              className="rounded-md px-3 py-1.5 font-medium text-white"
              style={{ backgroundColor: effectiveAccent }}
            >
              Subscribe
            </span>
          </div>
          <p
            className={cn(
              "text-sm",
              readable && !errors.accentColor ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {errors.accentColor ??
              (HEX_COLOR.test(accent) && !readable
                ? `Too light to read on white (${contrastRatio(accent, "#ffffff").toFixed(1)}:1). Pick a darker colour.`
                : "Used for links and buttons. It has to be readable on white.")}
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Font</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["sans", "Sans-serif", "font-sans"],
                ["serif", "Serif", "font-serif"],
              ] as const
            ).map(([value, label, cls]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-3",
                  font === value && "border-foreground ring-foreground ring-1",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="font-choice"
                    checked={font === value}
                    onChange={() => setFont(value)}
                  />
                  {label}
                </span>
                <span className={cn("text-lg", cls)}>The quick brown fox jumps.</span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-sm">{hint}</p>
      ) : null}
    </div>
  );
}
