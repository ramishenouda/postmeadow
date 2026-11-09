"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { resumePublication, suspendPublication } from "@/lib/reputation";

export async function pausePublication(publicationId: string, reason: string) {
  await requireAdmin();
  const why = reason.trim().slice(0, 300) || "Paused by the Postmeadow team.";
  await suspendPublication(publicationId, why);
  refresh();
}

export async function unpausePublication(publicationId: string) {
  await requireAdmin();
  await resumePublication(publicationId);
  refresh();
}
