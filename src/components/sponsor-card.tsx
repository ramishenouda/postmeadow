import type { Sponsor } from "@/lib/sponsor-types";

/** The web version of a post's sponsor placement. */
export function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  return (
    <aside aria-label={`Sponsored by ${sponsor.name}`} className="rounded-2xl border p-5 sm:p-6">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase">
        {`Sponsored by ${sponsor.name}`}
      </p>
      {sponsor.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the sponsor's own image
        <img
          src={sponsor.imageUrl}
          alt={sponsor.name}
          className="mt-3 max-h-48 rounded-lg border object-contain"
        />
      ) : null}
      <p className="mt-3 leading-7">{sponsor.text}</p>
      <a
        href={sponsor.url}
        rel="sponsored noopener"
        target="_blank"
        className="mt-4 inline-flex rounded-lg bg-(--accent) px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        {sponsor.cta}
      </a>
    </aside>
  );
}
