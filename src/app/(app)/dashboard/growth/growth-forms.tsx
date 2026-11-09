"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
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
import {
  addRecommendation,
  addReward,
  deleteLandingPage,
  deleteReward,
  removeRecommendation,
  saveLandingPage,
  savePopup,
  setReferrals,
  type GrowthResult,
} from "./actions";

function useResult() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GrowthResult | null>(null);
  const run = (action: () => Promise<GrowthResult>, onOk?: () => void) =>
    startTransition(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) onOk?.();
    });
  const message = result ? (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm text-emerald-700" : "text-destructive text-sm"}
    >
      {result.ok ? result.message : result.error}
    </p>
  ) : null;
  return { pending, run, message };
}

export function ReferralToggle({ enabled }: { enabled: boolean }) {
  const { pending, run, message } = useResult();
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          defaultChecked={enabled}
          disabled={pending}
          onChange={(e) => run(() => setReferrals(e.target.checked))}
        />
        Run a referral program
      </label>
      {message}
    </div>
  );
}

export function RewardForm() {
  const { pending, run, message } = useResult();
  const [key, setKey] = useState(0);
  return (
    <form
      key={key}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(
          () =>
            addReward({
              threshold: Number(f.get("threshold")),
              name: String(f.get("name") ?? ""),
              description: String(f.get("description") ?? ""),
            }),
          () => setKey((k) => k + 1),
        );
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          name="threshold"
          type="number"
          min={1}
          max={10000}
          required
          placeholder="3"
          aria-label="Referrals needed"
          className="w-20"
        />
        <Input
          name="name"
          required
          maxLength={80}
          placeholder="Sticker pack"
          aria-label="Reward"
          className="min-w-40 flex-1"
        />
        <Input
          name="description"
          maxLength={300}
          placeholder="What they get (optional)"
          aria-label="Description"
          className="min-w-48 flex-[2]"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Add reward
        </Button>
      </div>
      {message}
    </form>
  );
}

export function RemoveButton({
  kind,
  id,
  label,
}: {
  kind: "reward" | "recommendation" | "landing";
  id: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const action = {
    reward: deleteReward,
    recommendation: removeRecommendation,
    landing: deleteLandingPage,
  }[kind];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => {
        if (kind === "landing" && !confirm("Delete this landing page? Its link stops working."))
          return;
        startTransition(async () => void (await action(id)));
      }}
      className="text-muted-foreground hover:text-foreground rounded-md p-1"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

export function RecommendationForm({ origin }: { origin: string }) {
  const { pending, run, message } = useResult();
  const [key, setKey] = useState(0);
  return (
    <form
      key={key}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(
          () => addRecommendation(String(f.get("target") ?? ""), String(f.get("note") ?? "")),
          () => setKey((k) => k + 1),
        );
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          name="target"
          required
          placeholder={`${origin.replace(/^https?:\/\//, "")}/their-newsletter`}
          aria-label="Their page's address"
          className="min-w-56 flex-1"
        />
        <Input
          name="note"
          maxLength={200}
          placeholder="Why you like it (optional)"
          aria-label="Your note"
          className="min-w-56 flex-1"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Recommend
        </Button>
      </div>
      {message}
    </form>
  );
}

type LandingValues = {
  id?: string;
  slug: string;
  headline: string;
  body: string;
  buttonText: string;
  tag: string;
};

export function LandingPageEditor({ prefix, page }: { prefix: string; page?: LandingValues }) {
  const [open, setOpen] = useState(false);
  const { pending, run, message } = useResult();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          page ? (
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          ) : (
            <Button variant="outline">New landing page</Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                saveLandingPage({
                  id: page?.id ?? null,
                  slug: String(f.get("slug") ?? ""),
                  headline: String(f.get("headline") ?? ""),
                  body: String(f.get("body") ?? ""),
                  buttonText: String(f.get("buttonText") ?? ""),
                  tag: String(f.get("tag") ?? ""),
                }),
              () => setOpen(false),
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{page ? "Edit landing page" : "New landing page"}</DialogTitle>
            <DialogDescription>A page with one job: getting people to subscribe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="lp-slug">Address</Label>
            <div className="focus-within:ring-ring/50 flex items-center rounded-lg border focus-within:ring-3">
              <span className="text-muted-foreground truncate pl-2.5 text-xs">{prefix}</span>
              <Input
                id="lp-slug"
                name="slug"
                defaultValue={page?.slug}
                required
                maxLength={40}
                placeholder="podcast"
                className="border-0 pl-0.5 focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-headline">Headline</Label>
            <Input
              id="lp-headline"
              name="headline"
              defaultValue={page?.headline}
              required
              maxLength={120}
              placeholder="The weekly email for people who love gardening"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-body">What readers get</Label>
            <textarea
              id="lp-body"
              name="body"
              defaultValue={page?.body}
              rows={5}
              maxLength={3000}
              placeholder={
                "- One practical tip every Sunday\n- Seasonal planting calendar\n- Free, unsubscribe any time"
              }
              className="bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3"
            />
            <p className="text-muted-foreground text-xs">Markdown works: lists, **bold**, links.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lp-button">Button text</Label>
              <Input
                id="lp-button"
                name="buttonText"
                defaultValue={page?.buttonText}
                maxLength={30}
                placeholder="Subscribe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-tag">Tag sign-ups (optional)</Label>
              <Input
                id="lp-tag"
                name="tag"
                defaultValue={page?.tag}
                maxLength={40}
                placeholder="podcast"
              />
            </div>
          </div>
          {message}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PopupForm({ delay, headline }: { delay: number; headline: string }) {
  const { pending, run, message } = useResult();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => savePopup(Number(f.get("delay")), String(f.get("headline") ?? "")));
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="pp-delay">Show after (seconds)</Label>
          <Input
            id="pp-delay"
            name="delay"
            type="number"
            min={0}
            max={120}
            defaultValue={delay}
            className="w-28"
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="pp-headline">Headline</Label>
          <Input
            id="pp-headline"
            name="headline"
            defaultValue={headline}
            maxLength={100}
            placeholder="Get the best of us in your inbox"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          Save pop-up
        </Button>
      </div>
      {message}
    </form>
  );
}
