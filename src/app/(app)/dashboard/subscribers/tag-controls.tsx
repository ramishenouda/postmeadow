"use client";

import { Globe, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubscriberFilter } from "@/lib/subscriber-filters";
import { deleteTag, setSubscriberTags, setTagPublic, tagMatching } from "./actions";

/** Edit one subscriber's tags as a comma-separated list, with suggestions. */
export function EditTags({
  subscriberId,
  email,
  current,
  allTags,
}: {
  subscriberId: string;
  email: string;
  current: string[];
  allTags: string[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const chosen = new Set(
    value
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  const add = (name: string) =>
    setValue((v) => (v.trim() ? `${v.replace(/,\s*$/, "")}, ${name}` : name));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValue(current.join(", "));
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            {current.length ? "Edit tags" : "Add tags"}
          </Button>
        }
      />
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await setSubscriberTags(subscriberId, value);
              if (result.ok) setOpen(false);
              else setError(result.error);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Tags for {email}</DialogTitle>
            <DialogDescription>
              Separate tags with commas. New names become new tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${listId}-input`}>Tags</Label>
            <Input
              id={`${listId}-input`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="customers, berlin"
              autoComplete="off"
            />
            {allTags.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allTags
                  .filter((t) => !chosen.has(t.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => add(t)}
                      className="hover:bg-muted rounded-full border px-2 py-0.5 text-xs"
                    >
                      + {t}
                    </button>
                  ))}
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save tags"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Add a tag to these N subscribers": tags everyone the list currently shows. */
export function TagMatching({ filter, total }: { filter: SubscriberFilter; total: number }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await tagMatching(filter, name);
          setMessage(
            result.ok
              ? { ok: true, text: `Tagged ${total.toLocaleString("en")} as “${name.trim()}”.` }
              : { ok: false, text: result.error },
          );
          if (result.ok) setName("");
        });
      }}
    >
      <span className="text-muted-foreground">
        Tag these {total.toLocaleString("en")} {total === 1 ? "subscriber" : "subscribers"}:
      </span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="tag name"
        className="h-8 w-40"
        aria-label="Tag name"
        maxLength={40}
        required
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Add tag
      </Button>
      {message ? (
        <span
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-muted-foreground" : "text-destructive"}
        >
          {message.text}
        </span>
      ) : null}
    </form>
  );
}

/** The × on a tag chip: deletes the tag after a confirmation. */
export function DeleteTagButton({ id, name, count }: { id: string; name: string; count: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            aria-label={`Delete tag ${name}`}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground -mr-1 rounded-full p-0.5"
          >
            <X className="size-3" aria-hidden />
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the tag “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It&apos;s removed from {count.toLocaleString("en")} active{" "}
            {count === 1 ? "subscriber" : "subscribers"} (they stay subscribed). Scheduled posts
            going to this tag will no longer reach them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => startTransition(async () => void (await deleteTag(id)))}
          >
            Delete tag
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Toggle whether readers can pick this tag as a topic themselves. */
export function TopicToggle({
  id,
  name,
  isPublic,
}: {
  id: string;
  name: string;
  isPublic: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={isPublic}
      disabled={pending}
      title={
        isPublic
          ? "A public topic: readers can pick it when subscribing and on their preferences page. Click to make it private."
          : "Private. Click to let readers pick it as a topic."
      }
      aria-label={`${name}: ${isPublic ? "public topic" : "private tag"}`}
      onClick={() => startTransition(async () => void (await setTagPublic(id, !isPublic)))}
      className={
        isPublic
          ? "text-primary rounded-full p-0.5"
          : "text-muted-foreground/50 hover:text-foreground rounded-full p-0.5"
      }
    >
      <Globe className="size-3" aria-hidden />
    </button>
  );
}
