import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Mark />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2" aria-label="Main">
          <Link href="/pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
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
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm">
        <span className="flex items-center gap-2">
          <Mark /> {APP_NAME}
        </span>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
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
