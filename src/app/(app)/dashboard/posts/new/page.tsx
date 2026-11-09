import { desc, eq } from "drizzle-orm";
import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { postTemplates } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { EmailThumb } from "@/components/email-thumb";
import { EMAIL_DESIGNS } from "@/lib/email-designs";
import { STARTER_TEMPLATES, type StarterTemplate } from "@/lib/post-templates";
import { cn } from "@/lib/utils";
import { createPostFrom } from "../actions";
import { DeleteTemplateButton } from "./delete-template-button";

export const metadata: Metadata = { title: "New post" };

/** Start a post: blank, from a starter template, or from one of your saved templates. */
export default function NewPostPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/dashboard/posts" className="text-muted-foreground text-sm hover:underline">
          ← Posts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New post</h1>
        <p className="text-muted-foreground text-sm">
          Start from scratch, or from a structure. Everything stays editable.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="starters">
        <h2 id="starters" className="font-medium">
          Starter templates
        </h2>
        <p className="text-muted-foreground text-sm">
          Previews use your name and colour. Templates made for a design bring it along; you can
          switch design in the editor.
        </p>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <li className="hover:border-primary/40 relative flex flex-col overflow-hidden rounded-xl border border-dashed transition-colors">
            <div className="bg-muted/40 flex h-56 items-center justify-center border-b border-dashed">
              <FilePlus2 className="text-muted-foreground size-10" aria-hidden />
            </div>
            <div className="space-y-1 p-4">
              <p className="font-medium">Blank</p>
              <p className="text-muted-foreground text-sm">An empty page, in your usual design.</p>
            </div>
            <form action={createPostFrom.bind(null, "blank")}>
              <button type="submit" className="absolute inset-0 rounded-xl">
                <span className="sr-only">Start a blank post</span>
              </button>
            </form>
          </li>
          {STARTER_TEMPLATES.map((t) => (
            <li
              key={t.id}
              className="group hover:border-primary/40 relative flex flex-col overflow-hidden rounded-xl border transition hover:shadow-lg hover:shadow-emerald-900/5"
            >
              <EmailThumb
                src={`/previews/mine?template=${t.id}`}
                title={`${t.name} preview`}
                className="h-56 border-b"
              />
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      CATEGORY_STYLES[t.category],
                    )}
                  >
                    {t.category}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">{t.description}</p>
                {t.design ? (
                  <p className="text-muted-foreground mt-auto pt-1 text-xs">
                    Uses the {EMAIL_DESIGNS[t.design].name} design
                  </p>
                ) : null}
              </div>
              <form action={createPostFrom.bind(null, `starter:${t.id}`)}>
                <button
                  type="submit"
                  className="focus-visible:ring-ring absolute inset-0 rounded-xl focus-visible:ring-2"
                >
                  <span className="sr-only">Start from “{t.name}”</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<div className="bg-muted h-32 animate-pulse rounded-xl" />}>
        <SavedTemplates />
      </Suspense>
    </div>
  );
}

const CATEGORY_STYLES: Record<StarterTemplate["category"], string> = {
  Shops: "bg-orange-50 text-orange-800",
  Tech: "bg-indigo-50 text-indigo-700",
  Games: "bg-fuchsia-50 text-fuchsia-700",
  Writers: "bg-emerald-50 text-emerald-800",
};

async function SavedTemplates() {
  const { publication } = await requirePublication();
  const saved = await db
    .select({
      id: postTemplates.id,
      name: postTemplates.name,
      title: postTemplates.title,
      updatedAt: postTemplates.updatedAt,
    })
    .from(postTemplates)
    .where(eq(postTemplates.publicationId, publication.id))
    .orderBy(desc(postTemplates.updatedAt));

  return (
    <section className="space-y-3" aria-labelledby="saved">
      <h2 id="saved" className="font-medium">
        Your templates
      </h2>
      {saved.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          None yet. In the editor, use “Save as template” to reuse a post&apos;s structure.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {saved.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {t.title || "Untitled"} · saved {formatDate(t.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DeleteTemplateButton id={t.id} name={t.name} />
                <form action={createPostFrom.bind(null, `saved:${t.id}`)}>
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-md px-3 py-1.5 text-sm font-medium"
                  >
                    Use
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
