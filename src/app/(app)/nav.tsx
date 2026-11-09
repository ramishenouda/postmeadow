"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Role = "owner" | "editor" | "contributor";

/** Tabs, and the least role that sees each. */
const links: { href: string; label: string; exact?: boolean; min: Role }[] = [
  { href: "/dashboard", label: "Overview", exact: true, min: "contributor" },
  { href: "/dashboard/posts", label: "Posts", min: "contributor" },
  { href: "/dashboard/automations", label: "Automations", min: "editor" },
  { href: "/dashboard/subscribers", label: "Subscribers", min: "editor" },
  { href: "/dashboard/stats", label: "Stats", min: "editor" },
  { href: "/dashboard/growth", label: "Grow", min: "editor" },
  { href: "/dashboard/monetize", label: "Earn", min: "owner" },
  { href: "/dashboard/team", label: "Team", min: "contributor" },
  { href: "/dashboard/billing", label: "Billing", min: "owner" },
  { href: "/dashboard/settings", label: "Settings", min: "editor" },
];
const RANK: Record<Role, number> = { contributor: 0, editor: 1, owner: 2 };

export function DashboardNav({ role = "owner" }: { role?: Role }) {
  const pathname = usePathname();
  if (pathname.startsWith("/onboarding")) return null;
  return <NavLinks pathname={pathname} role={role} />;
}

/** Rendered without a pathname as the Suspense fallback (no tab highlighted). */
export function NavLinks({ pathname, role = "owner" }: { pathname?: string; role?: Role }) {
  return (
    <nav
      className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4"
      aria-label="Dashboard"
    >
      {links
        .filter((l) => RANK[role] >= RANK[l.min])
        .map(({ href, label, exact }) => {
          const active = pathname ? (exact ? pathname === href : pathname.startsWith(href)) : false;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground font-medium"
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
