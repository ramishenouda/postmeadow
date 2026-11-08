import "server-only";
import { createEmailMarkdownComponents } from "@/emails/components/markdown-email";
import NewsletterEmail from "@/emails/newsletter";
import { isEmailDesign } from "@/lib/email-designs";
import { renderEmail } from "@/lib/email/render";
import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree } from "@/lib/markdown/render";
import { markdownExcerpt } from "@/lib/markdown/excerpt";
import type { EmailRenderer } from "./types";

export const markdownRenderer: EmailRenderer = {
  format: "markdown",
  async render({ post, publication, urls }) {
    const tree = parseMarkdown(post.content);
    const design = isEmailDesign(publication.emailDesign) ? publication.emailDesign : "classic";
    const accent = publication.accentColor ?? undefined;
    return renderEmail(
      <NewsletterEmail
        design={design}
        publicationName={publication.name}
        publicationUrl={urls.publication}
        title={post.title}
        subtitle={post.subtitle}
        preview={post.subtitle || markdownExcerpt(tree, 140)}
        webUrl={urls.webVersion}
        unsubscribeUrl={urls.unsubscribe}
        senderName={publication.fromName ?? undefined}
        brand={{ logoUrl: publication.logoUrl, fontStyle: publication.fontStyle, accent }}
      >
        {renderMarkdownTree(
          tree,
          createEmailMarkdownComponents({ accent, accentHeadings: design === "magazine" }),
        )}
      </NewsletterEmail>,
    );
  },
};
