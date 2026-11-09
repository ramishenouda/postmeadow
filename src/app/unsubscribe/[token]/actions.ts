"use server";

import { redirect } from "next/navigation";
import { pauseByToken, resumeByToken, setTopicsByToken } from "@/lib/preferences";
import { unsubscribeByToken } from "@/lib/subscribers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { readerPortalUrl } from "@/lib/paid";
import { absoluteUrl } from "@/lib/urls";

export async function unsubscribe(token: string) {
  await unsubscribeByToken(token);
  redirect(`/unsubscribe/${token}`);
}

export async function pause(token: string, formData: FormData) {
  await pauseByToken(token, Number(formData.get("months")));
  redirect(`/unsubscribe/${token}?saved=paused`);
}

export async function resume(token: string) {
  await resumeByToken(token);
  redirect(`/unsubscribe/${token}?saved=resumed`);
}

export async function saveTopics(token: string, formData: FormData) {
  await setTopicsByToken(token, formData.getAll("topic").map(String));
  redirect(`/unsubscribe/${token}?saved=topics`);
}

/** Stripe's page to change the card or cancel a paid subscription. */
export async function managePaid(token: string) {
  const [row] = await db
    .select({ customer: subscribers.stripeCustomerId })
    .from(subscribers)
    .where(eq(subscribers.unsubscribeToken, token));
  if (!row?.customer) redirect(`/unsubscribe/${token}`);
  const url = await readerPortalUrl(row.customer, absoluteUrl(`/unsubscribe/${token}`));
  redirect(url);
}
