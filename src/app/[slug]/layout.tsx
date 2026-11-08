import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">{children}</div>
      <footer className="text-muted-foreground border-t py-6 text-center text-xs">
        Published with{" "}
        <Link href="/" className="underline underline-offset-2">
          {APP_NAME}
        </Link>
      </footer>
    </div>
  );
}
