import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  sending: "bg-sky-50 text-sky-700 ring-sky-600/20",
  queued: "bg-sky-50 text-sky-700 ring-sky-600/20",
  draft: "bg-stone-100 text-stone-700 ring-stone-500/20",
  unsubscribed: "bg-stone-100 text-stone-600 ring-stone-500/20",
  bounced: "bg-red-50 text-red-700 ring-red-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
};

const labels: Record<string, string> = { pending: "unconfirmed" };

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        styles[status] ?? styles.draft,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
