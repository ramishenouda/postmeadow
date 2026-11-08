import { desc, eq } from "drizzle-orm";
import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { postTemplates } from "@/db/schema";
import { requirePublication } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { STARTER_TEMPLATES } from "@/lib/post-templates";
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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <form action={createPostFrom.bind(null, "blank")} className="h-full">
              <button
                type="submit"
                className="hover:bg-muted/40 flex h-full w-full flex-col items-start gap-2 rounded-xl border border-dashed p-4 text-left"
              >
                <FilePlus2 className="text-muted-foreground size-5" aria-hidden />
                <span className="font-medium">Blank</span>
                <span className="text-muted-foreground text-sm">An empty page.</span>
              </button>
            </form>
          </li>
          {STARTER_TEMPLATES.map((t) => (
            <li key={t.id}>
              <form action={createPostFrom.bind(null, `starter:${t.id}`)} className="h-full">
                <button
                  type="submit"
                  className="hover:bg-muted/40 flex h-full w-full flex-col items-start gap-2 rounded-xl border p-4 text-left"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground text-sm">{t.description}</span>
                  <Outline content={t.content} />
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

/** The template's section headings, as a quick sketch of its shape. */
function Outline({ content }: { content: string }) {
  const headings = content
    .split("\n")
    .filter((l) => /^#{2,3} /.test(l))
    .map((l) => l.replace(/^#+ /, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))
    .slice(0, 4);
  if (headings.length === 0) return null;
  return (
    <ul className="text-muted-foreground mt-1 space-y-0.5 border-l pl-3 text-xs">
      {headings.map((h, i) => (
        <li key={i} className="truncate">
          {h}
        </li>
      ))}
    </ul>
  );
}

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
