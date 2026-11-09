import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePublication } from "@/lib/dal";
import { PostImportForm } from "./post-import-form";

export const metadata: Metadata = { title: "Import posts" };

export default function ImportPostsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link href="/dashboard/posts" className="text-muted-foreground text-sm hover:underline">
          ← Posts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Import posts</h1>
        <p className="text-muted-foreground text-sm">
          Bring your archive from Substack, Ghost, beehiiv, WordPress or any blog with a feed.
          Nothing is emailed. To bring your readers too, use{" "}
          <Link href="/dashboard/subscribers/import" className="underline">
            Subscribers → Import
          </Link>{" "}
          with the subscriber CSV from your old platform.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  await requirePublication("editor");
  return <PostImportForm />;
}
