import { formatBytes, formatPrice, PLANS, PRICES, STORAGE_ADDON_BYTES } from "@/lib/plans";

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Is the free plan really free?",
    a: `Yes, with no time limit. You get every feature and ${formatBytes(PLANS.free.storageBytes)} of image storage. Upgrade only if you need more room.`,
  },
  {
    q: "What counts toward storage?",
    a: "Images you upload: pictures in your posts and your logo. They're resized and compressed on upload, so they take far less space than the originals.",
  },
  {
    q: "What happens if I run out of storage?",
    a: `Nothing breaks. Your existing images keep working, including in emails you've already sent; only new uploads pause. Delete unused images, or add ${formatBytes(STORAGE_ADDON_BYTES)} for ${formatPrice(PRICES.storage_addon.month)} a month.`,
  },
  {
    q: "Can I bring my existing subscribers?",
    a: "Yes. Import a CSV or paste a list of addresses. Everyone who already unsubscribed stays unsubscribed, and you can export your list any time.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes, from the billing page. Your plan stays active until the end of the period you've paid for, then you move to Free. Nothing is deleted.",
  },
  {
    q: "How do readers subscribe and unsubscribe?",
    a: "Your publication gets its own page with a sign-up form. New subscribers confirm by email (double opt-in), and every email has a one-click unsubscribe link that works with Gmail's and Apple Mail's built-in buttons.",
  },
];

export function Faq() {
  return (
    <div className="divide-y rounded-2xl border">
      {QUESTIONS.map(({ q, a }) => (
        <details key={q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
            {q}
            <span
              className="text-muted-foreground transition-transform group-open:rotate-45"
              aria-hidden
            >
              +
            </span>
          </summary>
          <p className="text-muted-foreground mt-3 text-sm leading-6">{a}</p>
        </details>
      ))}
    </div>
  );
}
