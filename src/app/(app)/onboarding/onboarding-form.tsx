"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/slug";
import { createPublication, type CreatePublicationState } from "./actions";

export function OnboardingForm({
  defaultFromName,
  publicHost,
}: {
  defaultFromName: string;
  publicHost: string;
}) {
  const [state, formAction, pending] = useActionState<CreatePublicationState, FormData>(
    createPublication,
    {},
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  // The address follows the name until the user edits it themselves.
  const [name, setName] = useState(values.name ?? "");
  const [slug, setSlug] = useState(values.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(values.slug));
  const [fromName, setFromName] = useState(values.fromName ?? defaultFromName);
  const [fromNameTouched, setFromNameTouched] = useState(
    Boolean(values.fromName || defaultFromName),
  );

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <Field id="name" label="Name" error={errors.name}>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
                if (!fromNameTouched) setFromName(e.target.value);
              }}
              placeholder="The Weekly Byte"
              maxLength={80}
              required
              autoFocus
              aria-invalid={Boolean(errors.name)}
            />
          </Field>

          <Field
            id="slug"
            label="Address"
            hint="Your public page and archive live here."
            error={errors.slug}
          >
            <div className="focus-within:ring-ring/50 flex items-center rounded-lg border focus-within:ring-3">
              <span className="text-muted-foreground pl-2.5 text-sm select-none">
                {publicHost}/
              </span>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                placeholder="the-weekly-byte"
                maxLength={40}
                required
                className="border-0 pl-0.5 focus-visible:ring-0"
                aria-invalid={Boolean(errors.slug)}
              />
            </div>
          </Field>

          <Field
            id="description"
            label="Description"
            hint="Optional. One or two sentences shown on your subscribe page."
            error={errors.description}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={values.description}
              maxLength={280}
              rows={3}
              placeholder="A weekly roundup of…"
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              id="fromName"
              label="Sender name"
              hint="Shown in subscribers' inboxes."
              error={errors.fromName}
            >
              <Input
                id="fromName"
                name="fromName"
                value={fromName}
                onChange={(e) => {
                  setFromNameTouched(true);
                  setFromName(e.target.value);
                }}
                maxLength={80}
                required
                aria-invalid={Boolean(errors.fromName)}
              />
            </Field>
            <Field
              id="replyTo"
              label="Reply-to email"
              hint="Optional. Where replies go."
              error={errors.replyTo}
            >
              <Input
                id="replyTo"
                name="replyTo"
                type="email"
                defaultValue={values.replyTo}
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.replyTo)}
              />
            </Field>
          </div>

          {errors.form ? (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Creating…" : "Create publication"}
          </Button>
        </form>
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
