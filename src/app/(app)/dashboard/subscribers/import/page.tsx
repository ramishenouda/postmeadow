import type { Metadata } from "next";
import Link from "next/link";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import subscribers · Newsletter" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/dashboard/subscribers"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Subscribers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Import subscribers</h1>
        <p className="text-muted-foreground text-sm">
          Upload a CSV with an <code>email</code> column, or paste addresses one per line. People
          already on your list, including anyone who unsubscribed, are skipped.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
