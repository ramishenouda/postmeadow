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
import { EmailThumb } from "@/components/email-thumb";
import { Meadow, SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: a calm home for your newsletter` },
  description:
    "Write in a friendly editor, grow your list with a beautiful public page, and send every issue straight to your readers' inboxes. Free to start.",
  alternates: { canonical: "/" },
};

const FEATURES: { icon: LucideIcon; title: string; body: string; tint: string }[] = [
  {
    icon: ImagePlus,
    title: "An editor that gets out of the way",
    body: "Write like in a document. Type / for headings, buttons and tables; drop in photos and put them side by side, with captions and prices.",
    tint: "bg-sky-50 text-sky-700 ring-sky-100",
  },
  {
    icon: Inbox,
    title: "Emails that land well",
    body: "Every issue is built to look right in Gmail, Outlook and Apple Mail, with a preview of exactly what readers receive before you send.",
    tint: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  },
  {
    icon: Palette,
    title: "Your brand, not ours",
    body: "Add your logo, pick an accent colour and a font. They're applied to your emails and your public page, and checked so they stay readable.",
    tint: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
  },
  {
    icon: ShieldCheck,
    title: "A list you can trust",
    body: "Double opt-in, one-click unsubscribe, and automatic handling of bounces and spam reports keep your list healthy and your sending reputation clean.",
    tint: "bg-amber-50 text-amber-800 ring-amber-100",
  },
  {
    icon: ChartNoAxesColumn,
    title: "See what resonates",
    body: "Opens, clicks and your most-clicked links for every issue, alongside delivery status for every reader.",
    tint: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  },
  {
    icon: Rss,
    title: "Open by default",
    body: "Every issue also lives on the web, with an RSS feed and good-looking previews when it's shared. Import or export your list any time.",
    tint: "bg-orange-50 text-orange-700 ring-orange-100",
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
        <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-emerald-50/50 to-lime-50/40">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -right-16 size-[28rem] rounded-full bg-amber-200/50 blur-3xl" />
            <div className="absolute top-40 right-1/3 size-80 rounded-full bg-fuchsia-200/40 blur-3xl" />
            <div className="absolute -bottom-10 left-1/4 size-80 rounded-full bg-sky-200/40 blur-3xl" />
          </div>
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-16 pb-10 lg:grid-cols-[1fr_1.05fr] lg:pt-20 lg:pb-14">
            <div className="space-y-7">
              <p className="bg-background/80 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Free to start, no card
                needed
              </p>
              <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-balance text-stone-900 sm:text-6xl">
                Newsletters people{" "}
                <span className="bg-gradient-to-r from-emerald-700 via-teal-600 to-sky-600 bg-clip-text text-transparent italic">
                  love
                </span>{" "}
                to open.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-stone-600">
                A new collection, a product launch, a game update or your weekly letter: write it in
                a friendly editor, pick a design that fits your brand, and send it straight to your
                readers&apos; inboxes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/sign-in" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
                  Start your newsletter
                </Link>
                <Link
                  href="#examples"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "bg-background/70 h-11 px-5",
                  )}
                >
                  See examples
                </Link>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
                {["7 email designs", "Templates with photos", "Every feature on Free"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="text-primary size-4" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <HeroFan />
          </div>
          <Meadow />
        </section>

        {/* Examples */}
        <section id="examples" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-24">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="text-primary text-sm font-medium">Made with {APP_NAME}</p>
            <h2 className="font-display text-4xl font-semibold tracking-tight text-balance">
              One editor. Every kind of newsletter.
            </h2>
            <p className="text-muted-foreground text-lg">
              Start from a template with real photos, put products side by side, add buttons that
              stand out. These are real emails, rendered live.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {EXAMPLES.map((ex) => (
              <figure key={ex.id} className={cn("rounded-3xl p-3 ring-1", ex.tint)}>
                <EmailThumb
                  src={`/previews/examples/${ex.id}`}
                  title={`${ex.label} example`}
                  className="h-[26rem] rounded-2xl shadow-lg ring-1 ring-black/5"
                  scale={0.42}
                />
                <figcaption className="px-2 pt-4 pb-2">
                  <p className="font-display text-lg font-semibold text-stone-900">{ex.label}</p>
                  <p className="text-sm text-stone-600">{ex.note}</p>
                </figcaption>
              </figure>
            ))}
          </div>
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
            {FEATURES.map(({ icon: Icon, title, body, tint }) => (
              <div
                key={title}
                className="group bg-card rounded-2xl border p-6 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
              >
                <span
                  className={cn("flex size-11 items-center justify-center rounded-xl ring-1", tint)}
                >
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
              Every feature on every plan. Upgrade when your list grows.
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

const EXAMPLES = [
  {
    id: "new-collection",
    label: "Fashion drop",
    note: "Boutique design · product row with prices",
    tint: "bg-orange-50 ring-orange-100",
  },
  {
    id: "product-launch",
    label: "Product launch",
    note: "Launch design · dark header, feature cards",
    tint: "bg-indigo-50 ring-indigo-100",
  },
  {
    id: "game-update",
    label: "Game update",
    note: "Arcade design · neon, patch notes",
    tint: "bg-fuchsia-50 ring-fuchsia-100",
  },
  {
    id: "sample",
    label: "Weekly letter",
    note: "Magazine design · cover photo, your colour",
    tint: "bg-emerald-50 ring-emerald-100",
  },
];

/** Three real example emails, fanned out like a stack of post. */
function HeroFan() {
  const card = "absolute w-[17rem] rounded-2xl shadow-2xl ring-1 ring-black/10 sm:w-[19rem]";
  return (
    <div aria-hidden className="relative mx-auto h-[30rem] w-full max-w-lg sm:h-[34rem]">
      <EmailThumb
        src="/previews/examples/product-launch"
        title="Product launch example"
        scale={0.46}
        className={cn(card, "top-6 left-0 hidden h-[26rem] -rotate-6 sm:block")}
      />
      <EmailThumb
        src="/previews/examples/game-update"
        title="Game update example"
        scale={0.46}
        className={cn(card, "top-6 right-0 hidden h-[26rem] rotate-6 sm:block")}
      />
      <EmailThumb
        src="/previews/examples/new-collection"
        title="Fashion example"
        scale={0.46}
        className={cn(card, "top-0 left-1/2 h-[28rem] -translate-x-1/2 sm:h-[31rem]")}
      />
    </div>
  );
}
