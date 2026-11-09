"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { answerInvitation } from "@/lib/invitations";
import { sendWelcomeEmail } from "@/lib/welcome";
import { reportError } from "@/lib/report";

/**
 * The reader's answer. A form post from the invitation page, never a link in the
 * email: mail scanners open links, and must not accept or decline for anyone.
 */
export async function respondToInvitation(token: string, answer: "accept" | "decline") {
  const answered = await answerInvitation(token, answer === "accept" ? "accept" : "decline");
  if (answered && answer === "accept") {
    after(() => sendWelcomeEmail(answered.id).catch((e) => reportError("welcome email failed", e)));
  }
  // The page shows the outcome (or why it didn't work, e.g. expired).
  redirect(`/invite/${encodeURIComponent(token)}`);
}
