"use server";

import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { subscribeToRecommended } from "@/lib/recommendations";
import { reportError } from "@/lib/report";
import { verify } from "@/lib/signed";
import { sendWelcomeEmail } from "@/lib/welcome";
import { enrollOnConfirm } from "@/lib/automations";

export type RecommendState =
  { status: "idle" } | { status: "done"; count: number } | { status: "error"; message: string };

/** One-click subscriptions to the recommended publications the reader ticked. */
export async function subscribeRecommended(
  proof: string,
  _prev: RecommendState,
  formData: FormData,
): Promise<RecommendState> {
  const subscriberId = verify("welcome", proof);
  if (!subscriberId) {
    return {
      status: "error",
      message: "This page has expired. Subscribe from their pages instead.",
    };
  }
  const [reader] = await db
    .select({
      email: subscribers.email,
      publicationId: subscribers.publicationId,
      status: subscribers.status,
    })
    .from(subscribers)
    .where(eq(subscribers.id, subscriberId));
  if (!reader || reader.status !== "active") {
    return { status: "error", message: "Subscribe from their pages instead." };
  }
  const ids = formData.getAll("publication").map(String);
  const added = await subscribeToRecommended(reader.publicationId, reader.email, ids);
  after(async () => {
    for (const id of added) {
      await sendWelcomeEmail(id).catch((e) => reportError("welcome email failed", e));
      await enrollOnConfirm(id).catch((e) => reportError("automation enroll failed", e));
    }
  });
  return { status: "done", count: added.length };
}
