import "server-only";
import { createEmailMarkdownComponents } from "@/emails/components/markdown-email";
import NewsletterEmail from "@/emails/newsletter";
import { EMAIL_DESIGNS, isEmailDesign } from "@/lib/email-designs";
import { renderEmail } from "@/lib/email/render";
import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree, splitHero } from "@/lib/markdown/render";
import { markdownExcerpt } from "@/lib/markdown/excerpt";
import { SponsorBlock } from "@/emails/components/sponsor-block";
import { DEFAULT_ACCENT } from "@/lib/color";
import { readSponsor } from "@/lib/sponsor";
import type { EmailRenderer } from "./types";

export const markdownRenderer: EmailRenderer = {
  format: "markdown",
  async render({ post, publication, urls }) {
    const tree = parseMarkdown(post.content);
    const chosen = post.emailDesign ?? publication.emailDesign;
    const design = isEmailDesign(chosen) ? chosen : "classic";
    const accent = publication.accentColor ?? undefined;
    // Designs with a cover photo show a post's opening image above the title.
    const { hero, rest } = EMAIL_DESIGNS[design].hero
      ? splitHero(tree)
      : { hero: null, rest: tree };
    const sponsor = readSponsor(post.sponsor);
    const sponsorBlock = sponsor ? (
      <SponsorBlock sponsor={sponsor} design={design} accent={accent ?? DEFAULT_ACCENT} />
    ) : null;
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
        postalAddress={publication.postalAddress}
        referUrl={publication.referralsEnabled ? `${urls.unsubscribe}#refer` : null}
        brand={{ logoUrl: publication.logoUrl, fontStyle: publication.fontStyle, accent }}
        hero={hero}
      >
        {sponsor?.position === "top" ? sponsorBlock : null}
        {renderMarkdownTree(rest, createEmailMarkdownComponents({ accent, design }))}
        {sponsor?.position === "bottom" ? sponsorBlock : null}
      </NewsletterEmail>,
    );
  },
};
