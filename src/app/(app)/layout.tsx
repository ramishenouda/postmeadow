import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/dal";
import { signOut } from "./actions";
import { DashboardNav, NavLinks } from "./nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          {/* Reads the session, so it streams in without holding up the page. */}
          <Suspense fallback={<div className="bg-muted h-7 w-40 animate-pulse rounded" />}>
            <UserMenu />
          </Suspense>
        </div>
        {/* usePathname() is URL data, so it streams in; the fallback shows the same tabs. */}
        <Suspense fallback={<NavLinks />}>
          <DashboardNav />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function UserMenu() {
  const session = await getSession();
  if (!session) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground hidden sm:inline">{session.user.email}</span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
