import "server-only";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import NoticeEmail, { type NoticeEmailProps } from "@/emails/notice";
import { env } from "@/env";
import { renderEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

/** Emails a short notice. Failures are logged, never thrown: notices are best effort. */
export async function sendNotice(to: string, subject: string, notice: NoticeEmailProps) {
  try {
    const { html, text } = await renderEmail(createElement(NoticeEmail, notice));
    await sendEmail({ to, subject, html, text });
  } catch (error) {
    console.error("notice failed", { subject, error });
  }
}

export async function notifyUser(userId: string, subject: string, notice: NoticeEmailProps) {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (row) await sendNotice(row.email, subject, notice);
}

/** Addresses in ADMIN_EMAILS (comma-separated). They can open /admin. */
export const adminEmails = () =>
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function notifyAdmins(subject: string, notice: NoticeEmailProps) {
  await Promise.all(adminEmails().map((to) => sendNotice(to, subject, notice)));
}
