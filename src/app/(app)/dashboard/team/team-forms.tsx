"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  inviteToTeam,
  leaveTeam,
  removeMember,
  revokeInvite,
  setMemberRole,
  setMyName,
  type TeamResult,
} from "./actions";

function useResult() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TeamResult | null>(null);
  const run = (action: () => Promise<TeamResult>, onOk?: () => void) =>
    startTransition(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) onOk?.();
    });
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

export function MyNameForm({ name }: { name: string }) {
  const { pending, run, message } = useResult();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setMyName(String(new FormData(e.currentTarget).get("name") ?? "")));
      }}
    >
      <div className="flex gap-2">
        <Input
          name="name"
          defaultValue={name}
          maxLength={60}
          placeholder="Ada Lovelace"
          aria-label="Your name"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Save
        </Button>
      </div>
      {message}
    </form>
  );
}

export function InviteForm({ disabled }: { disabled: boolean }) {
  const { pending, run, message } = useResult();
  const [key, setKey] = useState(0);
  return (
    <form
      key={key}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(
          () => inviteToTeam(String(f.get("email") ?? ""), String(f.get("role") ?? "")),
          () => setKey((k) => k + 1),
        );
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          aria-label="Their email"
          className="min-w-56 flex-1"
          disabled={disabled}
        />
        <select
          name="role"
          defaultValue="editor"
          aria-label="Role"
          className="bg-background h-8 rounded-lg border px-2.5 text-sm"
          disabled={disabled}
        >
          <option value="editor">Editor</option>
          <option value="contributor">Contributor</option>
        </select>
        <Button type="submit" disabled={pending || disabled}>
          Invite
        </Button>
      </div>
      {disabled ? (
        <p className="text-muted-foreground text-sm">
          Your plan&apos;s team is full. Upgrade in Billing for more places.
        </p>
      ) : null}
      {message}
    </form>
  );
}

export function MemberControls({
  userId,
  role,
  email,
}: {
  userId: string;
  role: string;
  email: string;
}) {
  const { pending, run, message } = useResult();
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <select
          defaultValue={role}
          disabled={pending}
          aria-label={`Role of ${email}`}
          onChange={(e) => run(() => setMemberRole(userId, e.target.value))}
          className="bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="editor">Editor</option>
          <option value="contributor">Contributor</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (confirm(`Remove ${email} from the team?`)) run(() => removeMember(userId));
          }}
        >
          Remove
        </Button>
      </span>
      {message}
    </span>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const { pending, run } = useResult();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => run(() => revokeInvite(id))}
    >
      Withdraw
    </Button>
  );
}

export function LeaveTeamButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (confirm("Leave this team? You'll lose access to its dashboard.")) {
          startTransition(async () => void (await leaveTeam()));
        }
      }}
    >
      Leave the team
    </Button>
  );
}
