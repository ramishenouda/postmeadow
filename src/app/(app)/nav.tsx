"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/posts", label: "Posts" },
  { href: "/dashboard/subscribers", label: "Subscribers" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/onboarding")) return null;
  return <NavLinks pathname={pathname} />;
}

/** Rendered without a pathname as the Suspense fallback (no tab highlighted). */
export function NavLinks({ pathname }: { pathname?: string }) {
  return (
    <nav
      className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4"
      aria-label="Dashboard"
    >
      {links.map(({ href, label, exact }) => {
        const active = pathname ? (exact ? pathname === href : pathname.startsWith(href)) : false;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-foreground text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
