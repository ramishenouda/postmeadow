import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Meadow, Wordmark } from "@/components/marketing/site-chrome";
import { APP_NAME } from "@/lib/brand";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-gradient-to-b from-emerald-50 via-emerald-50/50 to-lime-50/60">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-amber-100/70 blur-3xl"
      />
      <div className="relative flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex justify-center">
            <Link href="/" aria-label={`${APP_NAME} home`}>
              <Wordmark />
            </Link>
          </div>
          <div className="bg-card space-y-6 rounded-2xl border p-6 shadow-xl shadow-emerald-900/5 sm:p-8">
            <div className="space-y-2 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Sign in or create an account
              </h1>
              <p className="text-muted-foreground text-sm">
                We&apos;ll email you a link to sign in. No password needed.
              </p>
            </div>
            {/* The form reads ?error= from the URL, which is request data. */}
            <Suspense>
              <SignInForm />
            </Suspense>
          </div>
          <p className="text-muted-foreground text-center text-xs">
            New here? The same link creates your account. Free, no card needed.
          </p>
        </div>
      </div>
      <Meadow className="relative" />
    </main>
  );
}
