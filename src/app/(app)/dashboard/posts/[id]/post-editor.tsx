"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { deletePost, savePost, sendPost, sendTest, type PostInput } from "../actions";

type Draft = { id: string; title: string; subtitle: string; slug: string; content: string };

type SaveState =
  | { status: "saved"; at?: Date }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "error"; error: string; field?: keyof PostInput };

type Notice = { kind: "success" | "error"; text: string } | null;

const AUTOSAVE_MS = 1200;
const PREVIEW_MS = 400;

export function PostEditor({
  post,
  urlPrefix,
  activeSubscribers,
  ownerEmail,
}: {
  post: Draft;
  urlPrefix: string;
  activeSubscribers: number;
  ownerEmail: string;
}) {
  const [title, setTitle] = useState(post.title);
  const [subtitle, setSubtitle] = useState(post.subtitle);
  const [slug, setSlug] = useState(post.slug);
  const [content, setContent] = useState(post.content);
  // The URL follows the title until the writer edits it.
  const [slugFollowsTitle, setSlugFollowsTitle] = useState(
    post.slug.startsWith("untitled-") || post.slug === slugify(post.title),
  );
  const [save, setSave] = useState<SaveState>({ status: "saved" });
  const [notice, setNotice] = useState<Notice>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, startTransition] = useTransition();

  // Bumped on every edit; a save only marks "saved" if nothing changed meanwhile.
  const version = useRef(0);
  const valuesRef = useRef({ title, subtitle, slug, content });
  useEffect(() => {
    valuesRef.current = { title, subtitle, slug, content };
  }, [title, subtitle, slug, content]);

  const edit = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    version.current++;
    setSave({ status: "dirty" });
  };

  const onTitle = (value: string) => {
    edit(setTitle)(value);
    if (slugFollowsTitle) setSlug(slugify(value) || post.slug);
  };

  const flush = useCallback(async (): Promise<boolean> => {
    const v = version.current;
    setSave({ status: "saving" });
    const result = await savePost(post.id, valuesRef.current);
    if (!result.ok) {
      setSave({ status: "error", error: result.error, field: result.field });
      return false;
    }
    if (version.current === v) setSave({ status: "saved", at: new Date(result.savedAt) });
    else setSave({ status: "dirty" });
    return true;
  }, [post.id]);

  // Autosave after a pause in typing.
  useEffect(() => {
    if (save.status !== "dirty") return;
    const timer = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [title, subtitle, slug, content, save.status, flush]);

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  // Warn before leaving with unsaved changes.
  const unsaved = save.status === "dirty" || save.status === "saving" || save.status === "error";
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  // Live preview: the real email HTML, rendered on the server.
  const [previewHtml, setPreviewHtml] = useState<string>("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, subtitle, slug, content }),
          signal: controller.signal,
        });
        if (res.ok) setPreviewHtml(await res.text());
      } catch {
        // Aborted by a newer keystroke, or offline; keep the last preview.
      }
    }, PREVIEW_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [post.id, title, subtitle, slug, content]);

  const run = (
    action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>,
  ) =>
    startTransition(async () => {
      setNotice(null);
      if (unsaved && !(await flush())) {
        setNotice({ kind: "error", text: "Fix the highlighted problem first." });
        return;
      }
      const result = await action();
      setNotice(
        result.ok
          ? { kind: "success", text: result.message }
          : { kind: "error", text: result.error },
      );
    });

  const fieldError = (field: keyof PostInput) =>
    save.status === "error" && save.field === field ? save.error : undefined;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/dashboard/posts" className="text-muted-foreground hover:underline">
            ← Posts
          </Link>
          <SaveIndicator state={save} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DeleteButton postId={post.id} disabled={busy} />
          <Button variant="outline" disabled={busy} onClick={() => run(() => sendTest(post.id))}>
            Send test
          </Button>
          <SendButton
            title={title}
            activeSubscribers={activeSubscribers}
            disabled={busy}
            onConfirm={() => run(() => sendPost(post.id))}
          />
        </div>
      </div>

      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            notice.kind === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-emerald-600/20 bg-emerald-50 text-emerald-800",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {/* Small screens: switch between writing and preview */}
      <div className="bg-muted flex gap-1 rounded-lg p-1 text-sm lg:hidden" role="tablist">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 capitalize",
              tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={cn("space-y-4", tab !== "write" && "hidden lg:block")}>
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Title"
            aria-label="Title"
            maxLength={200}
            className="placeholder:text-muted-foreground/60 w-full bg-transparent text-3xl font-semibold tracking-tight outline-none"
          />
          <input
            value={subtitle}
            onChange={(e) => edit(setSubtitle)(e.target.value)}
            placeholder="Subtitle (optional, also used as the inbox preview)"
            aria-label="Subtitle"
            maxLength={300}
            className="text-muted-foreground placeholder:text-muted-foreground/60 w-full bg-transparent text-lg outline-none"
          />
          <div className="space-y-1">
            <Label htmlFor="slug" className="text-muted-foreground text-xs">
              Web address
            </Label>
            <div className="focus-within:ring-ring/50 flex items-center rounded-lg border focus-within:ring-3">
              <span className="text-muted-foreground truncate pl-2.5 text-xs select-none">
                {urlPrefix}
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugFollowsTitle(false);
                  edit(setSlug)(e.target.value.toLowerCase());
                }}
                maxLength={40}
                className="h-8 min-w-24 border-0 pl-0.5 text-xs focus-visible:ring-0"
                aria-invalid={Boolean(fieldError("slug"))}
              />
            </div>
            {fieldError("slug") ? (
              <p className="text-destructive text-xs">{fieldError("slug")}</p>
            ) : null}
          </div>
          <textarea
            value={content}
            onChange={(e) => edit(setContent)(e.target.value)}
            placeholder={
              "Write in Markdown…\n\n## A heading\n\nSome **bold** text, a [link](https://example.com), and a list:\n\n- one\n- two"
            }
            aria-label="Content (Markdown)"
            className="bg-background focus-visible:ring-ring/50 min-h-[60vh] w-full resize-y rounded-lg border p-4 font-mono text-sm leading-6 outline-none focus-visible:ring-3"
          />
          <p className="text-muted-foreground text-xs">
            Markdown: **bold**, _italic_, [links](https://…), ![images](https://…), lists, &gt;
            quotes, `code`, tables. Raw HTML is ignored.
          </p>
        </div>

        <div className={cn("space-y-2", tab !== "preview" && "hidden lg:block")}>
          <p className="text-muted-foreground text-xs">
            Email preview. A test goes to {ownerEmail}.
          </p>
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            sandbox=""
            className="h-[75vh] w-full rounded-lg border bg-white lg:sticky lg:top-4"
          />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text =
    state.status === "saving"
      ? "Saving…"
      : state.status === "dirty"
        ? "Unsaved changes"
        : state.status === "error"
          ? `Not saved: ${state.error}`
          : state.at
            ? `Saved ${state.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Draft";
  return (
    <span
      className={cn(
        "text-xs",
        state.status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
      aria-live="polite"
    >
      {text}
    </span>
  );
}

function SendButton({
  title,
  activeSubscribers,
  disabled,
  onConfirm,
}: {
  title: string;
  activeSubscribers: number;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const people = `${activeSubscribers.toLocaleString("en")} ${activeSubscribers === 1 ? "subscriber" : "subscribers"}`;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button disabled={disabled}>Send…</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send “{title || "Untitled"}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It goes to {people} and is published in your web archive. You can&apos;t edit or undo it
            after sending.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={activeSubscribers === 0}>
            Send to {people}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteButton({ postId, disabled }: { postId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" disabled={disabled || pending}>
            Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => startTransition(() => deletePost(postId))}
          >
            Delete draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
