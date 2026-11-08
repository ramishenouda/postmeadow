import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-muted-foreground text-lg">
        Write posts, grow your list, and send every issue straight to your subscribers.
      </p>
      <div>
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          Get started
        </Link>
      </div>
    </main>
  );
}
