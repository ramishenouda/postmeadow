import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_ACCENT } from "@/lib/color";
import { cn } from "@/lib/utils";

type Branded = {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  fontStyle: string;
};

/**
 * Applies a publication's brand to everything inside: `--accent` (use it as
 * `text-(--accent)` / `bg-(--accent)`) and the chosen font.
 */
export function Brand({ publication, children }: { publication: Branded; children: ReactNode }) {
  return (
    <div
      style={{ "--accent": publication.accentColor ?? DEFAULT_ACCENT } as CSSProperties}
      className={cn(publication.fontStyle === "serif" && "font-serif")}
    >
      {children}
    </div>
  );
}

/** The publication's logo, if it has one. */
export function Logo({ publication, className }: { publication: Branded; className?: string }) {
  if (!publication.logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logo from our own storage
    <img
      src={publication.logoUrl}
      alt={publication.name}
      className={cn("h-10 w-auto", className)}
    />
  );
}
