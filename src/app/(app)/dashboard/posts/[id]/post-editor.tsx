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
import { EMAIL_DESIGNS, type EmailDesign } from "@/lib/email-designs";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import {
  deletePost,
  savePost,
  schedulePost,
  sendPost,
  sendTest,
  unschedulePost,
  saveAsTemplate,
  setPostAudience,
  setPostDesign,
  setPostSponsor,
  setPostPaid,
  type AbTestInput,
  type PostInput,
} from "../actions";
import type { Sponsor } from "@/lib/sponsor-types";

type Draft = { id: string; title: string; subtitle: string; slug: string; content: string };
type Audience = "everyone" | "tags" | "paid";

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
  backHref,
  scheduledAt = null,
  design: initialDesign = null,
  defaultDesign = "classic",
  sendError = null,
  tags = [],
  audience: initialAudience = { mode: "everyone", tagIds: [] },
  recipients: initialRecipients = activeSubscribers,
  sponsor: initialSponsor = null,
  paidAvailable = false,
  paid: initialPaid = false,
  paidSubscribers = 0,
  canSend = true,
  abTest = null,
  abMinRecipients = 100,
}: {
  post: Draft;
  urlPrefix: string;
  activeSubscribers: number;
  ownerEmail: string;
  /**
   * "sent": editing the web version of a post that already went out.
   * "automation": an email in an automation (no sending, no web address).
   */
  mode?: "draft" | "sent" | "automation";
  /** Where "back" goes in automation mode. */
  backHref?: string;
  /** ISO time, when the post is scheduled. */
  scheduledAt?: string | null;
  /** This post's own email design; null uses the publication's (`defaultDesign`). */
  design?: string | null;
  defaultDesign?: string;
  /** Why the last (scheduled) send was refused. */
  sendError?: string | null;
  /** The publication's tags, with active subscribers per tag. */
  tags?: { id: string; name: string; active: number }[];
  /** Who it goes to: everyone, subscribers with any of these tags, or paid subscribers. */
  audience?: { mode: Audience; tagIds: string[] };
  /** The publication takes payments: offer "paid post" and "paid subscribers only". */
  paidAvailable?: boolean;
  paid?: boolean;
  paidSubscribers?: number;
  /** How many active subscribers that audience is right now. */
  recipients?: number;
  /** The issue's sponsor placement, if any. */
  sponsor?: Sponsor | null;
  /** False for contributors: they write, an editor sends. */
  canSend?: boolean;
  /** The saved A/B subject test, if one is set up. */
  abTest?: AbTestInput | null;
  abMinRecipients?: number;
}) {
  const sentMode = mode === "sent";
  const automationMode = mode === "automation";
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
  const [design, setDesign] = useState<string | null>(initialDesign);
  const [audience, setAudience] = useState(initialAudience);
  const [recipients, setRecipients] = useState(initialRecipients);
  const [sponsor, setSponsor] = useState<Sponsor | null>(initialSponsor);
  const [paid, setPaid] = useState(initialPaid);
  const changeAudience = (next: { mode: Audience; tagIds: string[] }) => {
    setAudience(next);
    startTransition(async () => {
      const result = await setPostAudience(post.id, next.mode, next.tagIds);
      if (result.ok) setRecipients(result.recipients);
      else setNotice({ kind: "error", text: result.error });
    });
  };
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
          body: JSON.stringify({ title, subtitle, slug, content, design, sponsor }),
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
  }, [tab, post.id, title, subtitle, slug, content, design, sponsor]);

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
            href={
              automationMode && backHref
                ? backHref
                : sentMode
                  ? `/dashboard/posts/${post.id}`
                  : "/dashboard/posts"
            }
            className="text-muted-foreground hover:underline"
          >
            {automationMode ? "← Automation" : sentMode ? "← Back to stats" : "← Posts"}
          </Link>
          <SaveIndicator state={save} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveTemplateDialog
            defaultName={title}
            disabled={busy}
            onSave={(name) => run(() => saveAsTemplate(post.id, name))}
          />
          {automationMode ? (
            <Button variant="outline" disabled={busy} onClick={() => run(() => sendTest(post.id))}>
              Send test
            </Button>
          ) : null}
          {sentMode || automationMode ? null : (
            <>
              <DeleteButton postId={post.id} disabled={busy} />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => sendTest(post.id))}
              >
                Send test
              </Button>
              {canSend ? (
                <SendDialog
                  title={title}
                  activeSubscribers={activeSubscribers}
                  recipients={recipients}
                  tags={tags}
                  audience={audience}
                  onAudience={changeAudience}
                  paidAvailable={paidAvailable}
                  paidSubscribers={paidSubscribers}
                  scheduledAt={scheduledAt}
                  disabled={busy}
                  abTest={abTest}
                  abMinRecipients={abMinRecipients}
                  onSendNow={(ab) => run(() => sendPost(post.id, ab))}
                  onSchedule={(at, ab) => run(() => schedulePost(post.id, at, ab))}
                />
              ) : (
                <span className="text-muted-foreground text-sm">An editor sends it</span>
              )}
            </>
          )}
        </div>
      </div>

      {automationMode ? (
        <p className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
          This email is part of an <strong>automation</strong>. The title is the subject line.
          Changes apply to everyone who reaches this step from now on. It isn&apos;t published on
          the web.
        </p>
      ) : sentMode ? (
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

      {sendError && !notice ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-600/20 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <strong>This post was scheduled but not sent.</strong> {sendError}
        </p>
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
        <div className="flex flex-wrap items-center gap-3">
          {sentMode ? null : (
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              Design
              <select
                value={design ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value || null;
                  setDesign(next);
                  run(() => setPostDesign(post.id, next));
                }}
                className="bg-background text-foreground focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
              >
                <option value="">
                  Publication default (
                  {EMAIL_DESIGNS[defaultDesign as EmailDesign]?.name ?? "Classic"})
                </option>
                {(Object.keys(EMAIL_DESIGNS) as EmailDesign[]).map((id) => (
                  <option key={id} value={id}>
                    {EMAIL_DESIGNS[id].name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {paidAvailable && !sentMode && !automationMode ? (
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={paid}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.checked;
                  setPaid(next);
                  run(() => setPostPaid(post.id, next));
                }}
              />
              Paid post
            </label>
          ) : null}
          {sentMode ? null : (
            <SponsorDialog
              sponsor={sponsor}
              disabled={busy}
              onSave={(next) =>
                run(async () => {
                  const result = await setPostSponsor(post.id, next);
                  if (result.ok)
                    setSponsor(next ? { ...next, cta: next.cta || "Learn more" } : null);
                  return result;
                })
              }
            />
          )}
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
      </div>

      <div className={cn("mx-auto max-w-3xl space-y-4", tab !== "write" && "hidden")}>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={automationMode ? "Subject" : "Title"}
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
        <div className={cn("space-y-1", automationMode && "hidden")}>
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
  recipients,
  tags,
  audience,
  onAudience,
  paidAvailable,
  paidSubscribers,
  scheduledAt,
  disabled,
  abTest,
  abMinRecipients,
  onSendNow,
  onSchedule,
}: {
  title: string;
  activeSubscribers: number;
  recipients: number;
  tags: { id: string; name: string; active: number }[];
  audience: { mode: Audience; tagIds: string[] };
  onAudience: (next: { mode: Audience; tagIds: string[] }) => void;
  paidAvailable: boolean;
  paidSubscribers: number;
  scheduledAt: string | null;
  disabled: boolean;
  abTest: AbTestInput | null;
  abMinRecipients: number;
  onSendNow: (ab: AbTestInput | null) => void;
  onSchedule: (isoTime: string, ab: AbTestInput | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [abOn, setAbOn] = useState(Boolean(abTest));
  const [ab, setAb] = useState<AbTestInput>(
    abTest ?? { subjectB: "", metric: "opens", percent: 20, waitHours: 4 },
  );
  const abTooSmall = recipients < abMinRecipients;
  const abActive = abOn && !abTooSmall;
  const [when, setWhen] = useState<"now" | "later">(scheduledAt ? "later" : "now");
  const [at, setAt] = useState(() => defaultScheduleTime(scheduledAt));
  const count = (n: number) =>
    `${n.toLocaleString("en")} ${n === 1 ? "subscriber" : "subscribers"}`;
  const people = count(recipients);
  const toggleTag = (id: string) =>
    onAudience({
      mode: "tags",
      tagIds: audience.tagIds.includes(id)
        ? audience.tagIds.filter((t) => t !== id)
        : [...audience.tagIds, id],
    });

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
            const test = abActive ? ab : null;
            if (when === "later") onSchedule(new Date(at).toISOString(), test);
            else onSendNow(test);
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
            <legend className="mb-1 text-sm font-medium">Who</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="audience"
                checked={audience.mode === "everyone"}
                onChange={() => onAudience({ mode: "everyone", tagIds: [] })}
              />
              Everyone ({count(activeSubscribers)})
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="audience"
                checked={audience.mode === "tags"}
                disabled={tags.length === 0}
                onChange={() => onAudience({ mode: "tags", tagIds: audience.tagIds })}
              />
              Only subscribers with these tags
              {tags.length === 0 ? (
                <span className="text-muted-foreground text-xs">(tag subscribers first)</span>
              ) : null}
            </label>
            {paidAvailable ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="audience"
                  checked={audience.mode === "paid"}
                  onChange={() => onAudience({ mode: "paid", tagIds: [] })}
                />
                Paid subscribers only ({count(paidSubscribers)})
              </label>
            ) : null}
            {audience.mode === "tags" ? (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {tags.map((t) => {
                  const on = audience.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTag(t.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {t.name} <span className="opacity-70">{t.active.toLocaleString("en")}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Subject line</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={abOn}
                disabled={abTooSmall}
                onChange={(e) => setAbOn(e.target.checked)}
              />
              A/B test a second subject line
              {abTooSmall ? (
                <span className="text-muted-foreground text-xs">
                  (needs {abMinRecipients}+ recipients)
                </span>
              ) : null}
            </label>
            {abActive ? (
              <div className="space-y-3 pl-6">
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground text-xs">
                    A: <span className="text-foreground">{title || "Untitled"}</span>
                  </p>
                  <Input
                    value={ab.subjectB}
                    onChange={(e) => setAb({ ...ab, subjectB: e.target.value })}
                    placeholder="B: another subject line"
                    aria-label="Subject B"
                    maxLength={200}
                    required
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    Test on
                    <select
                      value={ab.percent}
                      onChange={(e) => setAb({ ...ab, percent: Number(e.target.value) })}
                      className="bg-background h-8 rounded-md border px-2"
                    >
                      {[10, 20, 30, 50].map((p) => (
                        <option key={p} value={p}>
                          {p}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Winner by
                    <select
                      value={ab.metric}
                      onChange={(e) =>
                        setAb({ ...ab, metric: e.target.value as AbTestInput["metric"] })
                      }
                      className="bg-background h-8 rounded-md border px-2"
                    >
                      <option value="opens">Opens</option>
                      <option value="clicks">Clicks</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    after
                    <select
                      value={ab.waitHours}
                      onChange={(e) => setAb({ ...ab, waitHours: Number(e.target.value) })}
                      className="bg-background h-8 rounded-md border px-2"
                    >
                      {[1, 2, 4, 8, 24].map((h) => (
                        <option key={h} value={h}>
                          {h} {h === 1 ? "hour" : "hours"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-muted-foreground text-xs">
                  {Math.floor((recipients * ab.percent) / 200).toLocaleString("en")} people get A
                  and as many get B. After {ab.waitHours} {ab.waitHours === 1 ? "hour" : "hours"}{" "}
                  the subject with more {ab.metric} goes to everyone else.
                </p>
              </div>
            ) : null}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">When</legend>
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
                  everyone in this audience at that moment.
                </p>
              </div>
            ) : null}
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={recipients === 0}>
              {when === "later" ? "Schedule" : abActive ? "Start A/B test" : `Send to ${people}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Add, change or remove the issue's sponsor placement. */
function SponsorDialog({
  sponsor,
  disabled,
  onSave,
}: {
  sponsor: Sponsor | null;
  disabled: boolean;
  onSave: (next: Sponsor | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled}>
            {sponsor ? `Sponsor: ${sponsor.name}` : "Add sponsor"}
          </Button>
        }
      />
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const get = (k: string) => String(f.get(k) ?? "").trim();
            setOpen(false);
            onSave({
              name: get("name"),
              text: get("text"),
              url: get("url"),
              cta: get("cta"),
              imageUrl: get("imageUrl") || null,
              position: get("position") === "bottom" ? "bottom" : "top",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Sponsor</DialogTitle>
            <DialogDescription>
              A clearly labelled block at the top or bottom of this issue. Afterwards you get a
              results page to share with the sponsor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sp-name">Sponsor name</Label>
            <Input id="sp-name" name="name" defaultValue={sponsor?.name} required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-text">What to say</Label>
            <textarea
              id="sp-text"
              name="text"
              defaultValue={sponsor?.text}
              required
              maxLength={400}
              rows={3}
              className="bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="sp-url">Link</Label>
              <Input
                id="sp-url"
                name="url"
                type="url"
                defaultValue={sponsor?.url}
                placeholder="https://"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-cta">Button text</Label>
              <Input
                id="sp-cta"
                name="cta"
                defaultValue={sponsor?.cta}
                placeholder="Learn more"
                maxLength={40}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-image">Image address (optional)</Label>
            <Input
              id="sp-image"
              name="imageUrl"
              type="url"
              defaultValue={sponsor?.imageUrl ?? ""}
              placeholder="https://…/logo.png"
            />
          </div>
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Position</legend>
            {(["top", "bottom"] as const).map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="position"
                  value={p}
                  defaultChecked={(sponsor?.position ?? "top") === p}
                />
                {p === "top" ? "Top of the issue" : "Bottom of the issue"}
              </label>
            ))}
          </fieldset>
          <DialogFooter className="gap-2">
            {sponsor ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  onSave(null);
                }}
              >
                Remove sponsor
              </Button>
            ) : null}
            <Button type="submit">Save sponsor</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Save this post's structure and words as a reusable template. */
function SaveTemplateDialog({
  defaultName,
  disabled,
  onSave,
}: {
  defaultName: string;
  disabled: boolean;
  onSave: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" disabled={disabled}>
            Save as template
          </Button>
        }
      />
      <DialogContent>
        {open ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "");
              setOpen(false);
              onSave(name);
            }}
          >
            <DialogHeader>
              <DialogTitle>Save as template</DialogTitle>
              <DialogDescription>
                Saves the title, subtitle and text as they are now. Start new posts from it under
                Posts → New post.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                name="name"
                defaultValue={defaultName || "My template"}
                maxLength={80}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit">Save template</Button>
            </DialogFooter>
          </form>
        ) : null}
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
