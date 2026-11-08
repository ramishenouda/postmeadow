import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publications, subscribers } from "@/db/schema";
import { createEmailMarkdownComponents } from "@/emails/components/markdown-email";
import WelcomeEmail from "@/emails/welcome";
import { DEFAULT_ACCENT } from "@/lib/color";
import { renderEmail } from "@/lib/email/render";
import { fromWithName, sendEmail } from "@/lib/email/send";
import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree } from "@/lib/markdown/render";
import { publicationUrl, unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/urls";
import { DEFAULT_WELCOME_MESSAGE } from "@/lib/welcome-default";

/** Sends the publication's welcome email to a newly confirmed subscriber, if it's switched on. */
export async function sendWelcomeEmail(subscriberId: string): Promise<boolean> {
  const [row] = await db
    .select({ subscriber: subscribers, publication: publications })
    .from(subscribers)
    .innerJoin(publications, eq(subscribers.publicationId, publications.id))
    .where(eq(subscribers.id, subscriberId));
  if (!row || row.subscriber.status !== "active" || !row.publication.welcomeEnabled) return false;

  const { subscriber, publication } = row;
  const accent = publication.accentColor ?? DEFAULT_ACCENT;
  const message = publication.welcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE;

  const { html, text } = await renderEmail(
    <WelcomeEmail
      publicationName={publication.name}
      publicationUrl={publicationUrl(publication.slug)}
      unsubscribeUrl={unsubscribePageUrl(subscriber.unsubscribeToken)}
      brand={{ logoUrl: publication.logoUrl, accent, fontStyle: publication.fontStyle }}
    >
      {renderMarkdownTree(parseMarkdown(message), createEmailMarkdownComponents({ accent }))}
    </WelcomeEmail>,
  );

  await sendEmail({
    to: subscriber.email,
    from: fromWithName(publication.fromName),
    replyTo: publication.replyTo ?? undefined,
    subject: `Welcome to ${publication.name}`,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeOneClickUrl(subscriber.unsubscribeToken)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return true;
}
