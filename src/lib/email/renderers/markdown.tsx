import "server-only";
import { emailMarkdownComponents } from "@/emails/components/markdown-email";
import NewsletterEmail from "@/emails/newsletter";
import { renderEmail } from "@/lib/email/render";
import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree } from "@/lib/markdown/render";
import { markdownExcerpt } from "@/lib/markdown/excerpt";
import type { EmailRenderer } from "./types";

export const markdownRenderer: EmailRenderer = {
  format: "markdown",
  async render({ post, publication, urls }) {
    const tree = parseMarkdown(post.content);
    return renderEmail(
      <NewsletterEmail
        publicationName={publication.name}
        publicationUrl={urls.publication}
        title={post.title}
        subtitle={post.subtitle}
        preview={post.subtitle || markdownExcerpt(tree, 140)}
        webUrl={urls.webVersion}
        unsubscribeUrl={urls.unsubscribe}
      >
        {renderMarkdownTree(tree, emailMarkdownComponents)}
      </NewsletterEmail>,
    );
  },
};
