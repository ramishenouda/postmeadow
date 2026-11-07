"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component tree on an interval (used while a post is sending). */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
