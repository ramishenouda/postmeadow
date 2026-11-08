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
import { RichEditor } from "@/components/editor/rich-editor";
import { Monitor, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import {
  deletePost,
  savePost,
  schedulePost,
  sendPost,
  sendTest,
  unschedulePost,
  type PostInput,
} from "../actions";

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
  mode = "draft",
  scheduledAt = null,
}: {
  post: Draft;
  urlPrefix: string;
  activeSubscribers: number;
  ownerEmail: string;
  /** "sent": editing the web version of a post that already went out. */
  mode?: "draft" | "sent";
  /** ISO time, when the post is scheduled. */
  scheduledAt?: string | null;
}) {
  const sentMode = mode === "sent";
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
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
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
    if (slugFollowsTitle && !sentMode) setSlug(slugify(value) || post.slug);
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
    if (tab !== "preview") return;
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
  }, [tab, post.id, title, subtitle, slug, content]);

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
          <Link
            href={sentMode ? `/dashboard/posts/${post.id}` : "/dashboard/posts"}
            className="text-muted-foreground hover:underline"
          >
            {sentMode ? "← Back to stats" : "← Posts"}
          </Link>
          <SaveIndicator state={save} />
        </div>
        {sentMode ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <DeleteButton postId={post.id} disabled={busy} />
            <Button variant="outline" disabled={busy} onClick={() => run(() => sendTest(post.id))}>
              Send test
            </Button>
            <SendDialog
              title={title}
              activeSubscribers={activeSubscribers}
              scheduledAt={scheduledAt}
              disabled={busy}
              onSendNow={() => run(() => sendPost(post.id))}
              onSchedule={(at) => run(() => schedulePost(post.id, at))}
            />
          </div>
        )}
      </div>

      {sentMode ? (
        <p className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
          You&apos;re editing the <strong>web version</strong>. Emails that already went out
          don&apos;t change. Changes appear on your page as soon as they&apos;re saved.
        </p>
      ) : scheduledAt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-600/20 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>
            Scheduled for <LocalTime iso={scheduledAt} />. You can keep editing until then.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => unschedulePost(post.id))}
          >
            Unschedule
          </Button>
        </div>
      ) : null}

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-muted flex gap-1 rounded-lg p-1 text-sm" role="tablist">
          {(
            [
              ["write", "Write"],
              ["preview", "Email preview"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1.5",
                tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "preview" ? (
          <div className="flex items-center gap-1" role="group" aria-label="Preview width">
            {(
              [
                ["desktop", Monitor, "Desktop"],
                ["mobile", Smartphone, "Mobile"],
              ] as const
            ).map(([d, Icon, label]) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                aria-pressed={device === d}
                title={label}
                className={cn(
                  "text-muted-foreground hover:bg-muted inline-flex size-8 items-center justify-center rounded-md",
                  device === d && "bg-muted text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={cn("mx-auto max-w-3xl space-y-4", tab !== "write" && "hidden")}>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Title"
          aria-label="Title"
          maxLength={200}
          className="placeholder:text-muted-foreground/50 w-full bg-transparent text-4xl font-semibold tracking-tight outline-none"
        />
        <input
          value={subtitle}
          onChange={(e) => edit(setSubtitle)(e.target.value)}
          placeholder="Add a subtitle (optional, also shown as the inbox preview)"
          aria-label="Subtitle"
          maxLength={300}
          className="text-muted-foreground placeholder:text-muted-foreground/50 w-full bg-transparent text-xl outline-none"
        />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="slug" className="text-muted-foreground shrink-0 text-xs">
              Web address
            </Label>
            <div className="focus-within:ring-ring/50 flex min-w-0 flex-1 items-center rounded-md border focus-within:ring-3">
              <span className="text-muted-foreground truncate pl-2 text-xs select-none">
                {urlPrefix}
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugFollowsTitle(false);
                  edit(setSlug)(e.target.value.toLowerCase());
                }}
                // Sent emails link to this address, so it can't change after sending.
                readOnly={sentMode}
                title={sentMode ? "The address can't change after sending" : undefined}
                maxLength={40}
                className="h-7 min-w-24 border-0 pl-0.5 text-xs focus-visible:ring-0"
                aria-invalid={Boolean(fieldError("slug"))}
              />
            </div>
          </div>
          {fieldError("slug") ? (
            <p className="text-destructive text-xs">{fieldError("slug")}</p>
          ) : null}
        </div>
        <RichEditor initialMarkdown={post.content} onChange={edit(setContent)} />
      </div>

      {tab === "preview" ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-center text-xs">
            Exactly what subscribers receive. Send a test to see it in your own inbox ({ownerEmail}
            ).
          </p>
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            sandbox=""
            className={cn(
              "mx-auto block h-[75vh] rounded-lg border bg-white shadow-sm transition-[width]",
              device === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-3xl",
            )}
          />
        </div>
      ) : null}
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

/** A time in the viewer's own time zone. The server renders UTC; the browser corrects it. */
function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning className="font-medium">
      {new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleTime(scheduledAt: string | null): string {
  if (scheduledAt) return toLocalInput(new Date(scheduledAt));
  const tomorrowNine = new Date();
  tomorrowNine.setDate(tomorrowNine.getDate() + 1);
  tomorrowNine.setHours(9, 0, 0, 0);
  return toLocalInput(tomorrowNine);
}

function SendDialog({
  title,
  activeSubscribers,
  scheduledAt,
  disabled,
  onSendNow,
  onSchedule,
}: {
  title: string;
  activeSubscribers: number;
  scheduledAt: string | null;
  disabled: boolean;
  onSendNow: () => void;
  onSchedule: (isoTime: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<"now" | "later">(scheduledAt ? "later" : "now");
  const [at, setAt] = useState(() => defaultScheduleTime(scheduledAt));
  const people = `${activeSubscribers.toLocaleString("en")} ${activeSubscribers === 1 ? "subscriber" : "subscribers"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button disabled={disabled}>{scheduledAt ? "Reschedule…" : "Send…"}</Button>}
      />
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            // The input is local time; the browser converts it to an exact moment.
            if (when === "later") onSchedule(new Date(at).toISOString());
            else onSendNow();
          }}
        >
          <DialogHeader>
            <DialogTitle>Send “{title || "Untitled"}”</DialogTitle>
            <DialogDescription>
              It goes to your subscribers and is published in your web archive. Emails can&apos;t be
              changed after they&apos;re sent.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="sr-only">When</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="when"
                checked={when === "now"}
                onChange={() => setWhen("now")}
              />
              Send now to {people}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="when"
                checked={when === "later"}
                onChange={() => setWhen("later")}
              />
              Schedule for later
            </label>
            {when === "later" ? (
              <div className="space-y-1 pl-6">
                <Input
                  type="datetime-local"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  required
                  className="w-auto"
                  aria-label="Send at"
                />
                <p className="text-muted-foreground text-xs">
                  Your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). It goes to
                  everyone subscribed at that moment.
                </p>
              </div>
            ) : null}
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={when === "now" && activeSubscribers === 0}>
              {when === "now" ? `Send to ${people}` : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
