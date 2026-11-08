import {
  Check,
  ChartNoAxesColumn,
  ImagePlus,
  Inbox,
  Palette,
  Rss,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/marketing/faq";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Mark, Meadow, SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: a calm home for your newsletter` },
  description:
    "Write in a friendly editor, grow your list with a beautiful public page, and send every issue straight to your readers' inboxes. Free to start.",
  alternates: { canonical: "/" },
};

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ImagePlus,
    title: "An editor that gets out of the way",
    body: "Write like in a document. Type / for headings, lists and tables; paste or drop images and they upload, resize and optimise themselves.",
  },
  {
    icon: Inbox,
    title: "Emails that land well",
    body: "Every issue is built to look right in Gmail, Outlook and Apple Mail, with a preview of exactly what readers receive before you send.",
  },
  {
    icon: Palette,
    title: "Your brand, not ours",
    body: "Add your logo, pick an accent colour and a font. They're applied to your emails and your public page, and checked so they stay readable.",
  },
  {
    icon: ShieldCheck,
    title: "A list you can trust",
    body: "Double opt-in, one-click unsubscribe, and automatic handling of bounces and spam reports keep your list healthy and your sending reputation clean.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "See what resonates",
    body: "Opens, clicks and your most-clicked links for every issue, alongside delivery status for every reader.",
  },
  {
    icon: Rss,
    title: "Open by default",
    body: "Every issue also lives on the web, with an RSS feed and good-looking previews when it's shared. Import or export your list any time.",
  },
];

const STEPS = [
  { title: "Create your publication", body: "Pick a name and an address. It takes a minute." },
  { title: "Share your page", body: "Readers subscribe on your page and confirm by email." },
  { title: "Write and send", body: "Preview, send yourself a test, then send to everyone." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-emerald-50/60 to-lime-50/40">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-amber-100/70 blur-3xl"
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-16 pb-10 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-16">
            <div className="space-y-7">
              <p className="bg-background/80 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Free to start, no card
                needed
              </p>
              <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-balance text-stone-900 sm:text-6xl">
                A calm home for your <span className="text-primary italic">newsletter</span>.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-stone-600">
                Write in a friendly editor, grow your list with a beautiful public page, and send
                every issue straight to your readers&apos; inboxes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/sign-in" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
                  Start your newsletter
                </Link>
                <Link
                  href="/pricing"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "bg-background/70 h-11 px-5",
                  )}
                >
                  See pricing
                </Link>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
                {["Every feature on Free", "Your own public page", "Import your list"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="text-primary size-4" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <EmailMock />
          </div>
          <Meadow />
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24">
          <div className="max-w-2xl space-y-3">
            <p className="text-primary text-sm font-medium">Everything included</p>
            <h2 className="font-display text-4xl font-semibold tracking-tight text-balance">
              Everything a newsletter needs
            </h2>
            <p className="text-muted-foreground text-lg">
              No plugins, no setup. Every plan, including Free, gets all of it.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group bg-card rounded-2xl border p-6 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-lime-100 text-emerald-800 ring-1 ring-emerald-100">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-display mt-5 text-lg font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y bg-stone-50">
          <div className="mx-auto w-full max-w-6xl px-4 py-24">
            <h2 className="font-display text-4xl font-semibold tracking-tight text-balance">
              Up and running in minutes
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative space-y-3">
                  <span className="font-display text-primary block text-5xl font-semibold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="h-px w-12 bg-emerald-300" />
                  <h3 className="font-display text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground leading-7">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-24">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="text-primary text-sm font-medium">Pricing</p>
            <h2 className="font-display text-4xl font-semibold tracking-tight">Simple pricing</h2>
            <p className="text-muted-foreground text-lg">
              Every feature on every plan. Pay only when you need more storage.
            </p>
          </div>
          <div className="mt-12">
            <PricingTable />
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-4 pb-24">
          <h2 className="font-display mb-6 text-4xl font-semibold tracking-tight">Questions</h2>
          <Faq />
        </section>

        {/* Final call to action */}
        <section className="relative overflow-hidden bg-emerald-900 text-emerald-50">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-emerald-600/30 blur-3xl"
          />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-20 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Your first issue is waiting.
              </h2>
              <p className="text-lg text-emerald-100/80">
                Free forever. Upgrade when you outgrow it.
              </p>
            </div>
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 bg-white px-5 text-emerald-900 hover:bg-emerald-50",
              )}
            >
              Start your newsletter
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A stylised email, so the hero shows what you're making. */
function EmailMock() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-3xl bg-emerald-200/50" />
      <div className="relative overflow-hidden rounded-2xl border bg-white shadow-2xl shadow-emerald-900/10">
        <div className="flex items-center gap-1.5 border-b bg-stone-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-stone-300" />
          <span className="size-2.5 rounded-full bg-stone-300" />
          <span className="size-2.5 rounded-full bg-stone-300" />
          <span className="ml-3 truncate text-xs text-stone-500">
            From: Rami at The Weekly Meadow
          </span>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span className="font-display flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Mark className="size-5" /> The Weekly Meadow
            </span>
            <span className="underline">View in browser</span>
          </div>
          <h3 className="font-display mt-6 text-2xl leading-tight font-semibold text-stone-900">
            Five small things worth your Sunday
          </h3>
          <p className="mt-1 text-sm text-stone-500">Issue #42 · 4 min read</p>
          <div className="relative mt-5 aspect-[16/7] overflow-hidden rounded-lg bg-gradient-to-br from-sky-100 via-emerald-50 to-amber-100">
            <span className="absolute top-3 right-8 size-8 rounded-full bg-amber-200" />
            <Meadow className="absolute inset-x-0 bottom-0 h-12 sm:h-14" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="h-2.5 w-full rounded bg-stone-200" />
            <div className="h-2.5 w-11/12 rounded bg-stone-200" />
            <div className="h-2.5 w-4/5 rounded bg-stone-200" />
          </div>
          <span className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium">
            Read the full issue
          </span>
        </div>
      </div>
    </div>
  );
}
