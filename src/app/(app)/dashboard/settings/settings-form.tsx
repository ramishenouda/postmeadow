"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateSettings, type SettingsState } from "./actions";

type Values = { name: string; description: string; fromName: string; replyTo: string };

export function SettingsForm({ address, values }: { address: string; values: Values }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updateSettings, {});
  const errors = state.errors ?? {};
  const v = { ...values, ...state.values };

  return (
    <Card>
      <CardContent>
        {/* key: re-mount with fresh defaults after the server data changes */}
        <form action={formAction} className="space-y-6" key={JSON.stringify(values)}>
          <Field id="name" label="Name" error={errors.name}>
            <Input id="name" name="name" defaultValue={v.name} maxLength={80} required />
          </Field>
          <Field id="address" label="Address" hint="The address can't be changed.">
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
