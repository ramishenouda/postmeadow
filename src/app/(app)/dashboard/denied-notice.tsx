"use client";

import { useSearchParams } from "next/navigation";

/** Shown after being sent back from a page your role doesn't include. */
export function DeniedNotice() {
  if (useSearchParams().get("denied") !== "1") return null;
  return (
    <p
      role="status"
      className="mb-6 rounded-lg border border-amber-600/20 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      That page is for the publication&apos;s editors or owner. Ask them if you need it.
    </p>
  );
}
