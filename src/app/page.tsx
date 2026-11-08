import {
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
import { Mark, SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
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
        <section className="to-background bg-gradient-to-b from-emerald-50/80">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2 lg:py-28">
            <div className="space-y-6">
              <p className="bg-background text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                <Mark className="size-4" /> Free to start, no card needed
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                A calm home for your newsletter.
              </h1>
              <p className="text-muted-foreground max-w-xl text-lg">
                Write in a friendly editor, grow your list with a beautiful public page, and send
                every issue straight to your readers&apos; inboxes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sign-in"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-11 bg-emerald-800 px-5 text-white hover:bg-emerald-900",
                  )}
                >
                  Start your newsletter
                </Link>
                <Link
                  href="/pricing"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}
                >
                  See pricing
                </Link>
              </div>
            </div>
            <EmailMock />
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight">Everything a newsletter needs</h2>
            <p className="text-muted-foreground">
              No plugins, no setup. Every plan, including Free, gets all of it.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-medium">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-muted/30 border-y">
          <div className="mx-auto w-full max-w-6xl px-4 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Up and running in minutes</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="space-y-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-800 text-sm font-medium text-white">
                    {i + 1}
                  </span>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Simple pricing</h2>
            <p className="text-muted-foreground">
              Every feature on every plan. Pay only when you need more storage.
            </p>
          </div>
          <div className="mt-10">
            <PricingTable />
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-4 pb-20">
          <h2 className="mb-6 text-3xl font-semibold tracking-tight">Questions</h2>
          <Faq />
        </section>

        {/* Final call to action */}
        <section className="bg-emerald-900 text-emerald-50">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Your first issue is waiting.
              </h2>
              <p className="text-emerald-100/80">Free forever. Upgrade when you outgrow it.</p>
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
      <div className="absolute -inset-4 -z-10 rotate-2 rounded-3xl bg-emerald-200/40" />
      <div className="rounded-2xl border bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span className="flex items-center gap-2 font-semibold text-stone-900">
            <Mark className="size-5" /> The Weekly Meadow
          </span>
          <span className="underline">View in browser</span>
        </div>
        <h3 className="mt-6 font-serif text-2xl font-semibold text-stone-900">
          Five small things worth your Sunday
        </h3>
        <p className="mt-1 text-stone-500">Issue #42 · 4 min read</p>
        <div className="mt-5 aspect-[16/7] rounded-lg bg-gradient-to-br from-emerald-200 via-lime-100 to-amber-100" />
        <div className="mt-5 space-y-2">
          <div className="h-2.5 w-full rounded bg-stone-200" />
          <div className="h-2.5 w-11/12 rounded bg-stone-200" />
          <div className="h-2.5 w-4/5 rounded bg-stone-200" />
        </div>
        <span className="mt-6 inline-block rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white">
          Read the full issue
        </span>
      </div>
    </div>
  );
}
