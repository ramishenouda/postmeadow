import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in or create an account</h1>
          <p className="text-muted-foreground text-sm">
            We&apos;ll email you a link to sign in. No password needed.
          </p>
        </div>
        {/* The form reads ?error= from the URL, which is request data. */}
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}
