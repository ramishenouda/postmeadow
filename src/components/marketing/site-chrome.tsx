import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The Postmeadow wordmark: the mark plus the name in the display serif. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-center gap-2 font-semibold tracking-tight",
        size === "sm" ? "text-base" : "text-xl",
        className,
      )}
    >
      <Mark className={size === "sm" ? "size-5" : "size-6"} />
      {APP_NAME}
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden sm:inline-flex",
            )}
          >
            Pricing
          </Link>
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link href="/sign-in" className={buttonVariants({ size: "sm" })}>
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm">
        <div className="space-y-1">
          <Wordmark size="sm" className="text-foreground" />
          <p className="text-xs">A calm home for your newsletter.</p>
        </div>
        <nav className="flex gap-5" aria-label="Footer">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-in" className="hover:text-foreground">
            Start free
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** Rolling hills along the bottom of a section, in the brand greens. */
export function Meadow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={cn("pointer-events-none block h-16 w-full sm:h-24", className)}
      aria-hidden
    >
      <path d="M0 70 Q240 20 480 60 T960 55 T1440 45 V120 H0Z" fill="#bbf7d0" opacity="0.7" />
      <path d="M0 95 Q300 55 620 88 T1180 80 T1440 75 V120 H0Z" fill="#4ade80" opacity="0.55" />
      <path d="M0 110 Q360 85 760 106 T1440 100 V120 H0Z" fill="#166534" opacity="0.85" />
    </svg>
  );
}

/** A small envelope-in-a-meadow mark. */
export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#166534" />
      <path
        d="M3.5 7.5 12 13l8.5-5.5"
        fill="none"
        stroke="#dcfce7"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19c1.5-2.5 2.5-2.5 4 0M10 19c1.5-3 2.5-3 4 0M15 19c1.5-2.5 2.5-2.5 4 0"
        fill="none"
        stroke="#86efac"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
