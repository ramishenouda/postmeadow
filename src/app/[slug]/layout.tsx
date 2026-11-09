import Link from "next/link";
import { Mark } from "@/components/marketing/site-chrome";
import { APP_NAME } from "@/lib/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">{children}</div>
      <footer className="text-muted-foreground border-t py-8 text-center text-xs">
        <Link
          href="/"
          className="hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors"
        >
          <Mark className="size-4" />
          Published with{" "}
          <span className="font-display text-foreground font-semibold">{APP_NAME}</span>
        </Link>
        <p className="mt-3">
          <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
