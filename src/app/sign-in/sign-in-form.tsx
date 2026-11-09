"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "That sign-in link is invalid or has already been used. Request a new one.",
  EXPIRED_TOKEN: "That sign-in link has expired. Request a new one.",
};

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/** Only same-site paths in the dashboard; never an outside URL (open redirect). */
function safeNext(value: string | null): string {
  return value && /^\/(dashboard|admin)(\/[\w\-/?=&.%]*)?$/.test(value) ? value : "/dashboard";
}

export function SignInForm() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");
  const next = safeNext(searchParams.get("next"));
  const [state, setState] = useState<State>(
    linkError
      ? {
          status: "error",
          message: ERROR_MESSAGES[linkError] ?? "Sign-in failed. Request a new link.",
        }
      : { status: "idle" },
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return;

    setState({ status: "sending" });
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/sign-in",
    });

    if (error) {
      setState({
        status: "error",
        message:
          error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : (error.message ?? "Something went wrong. Try again."),
      });
      return;
    }
    setState({ status: "sent", email });
  }

  if (state.status === "sent") {
    return (
      <div className="bg-muted/40 space-y-3 rounded-lg border p-4 text-sm" role="status">
        <p className="font-medium">Check your inbox</p>
        <p className="text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="text-foreground font-medium">{state.email}</span>. It expires in 15
          minutes.
        </p>
        {process.env.NODE_ENV === "development" ? (
          <p className="text-muted-foreground">
            Dev:{" "}
            <a className="underline" href="http://localhost:8025" target="_blank" rel="noreferrer">
              open Mailpit
            </a>
          </p>
        ) : null}
        <Button variant="link" className="h-auto p-0" onClick={() => setState({ status: "idle" })}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
        />
      </div>
      {state.status === "error" ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={state.status === "sending"}>
        {state.status === "sending" ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
