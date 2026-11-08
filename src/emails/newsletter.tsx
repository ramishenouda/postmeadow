import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_ACCENT } from "@/lib/color";
import type { EmailDesign } from "@/lib/email-designs";

export type NewsletterEmailProps = {
  publicationName: string;
  publicationUrl: string;
  title: string;
  subtitle?: string | null;
  /** Shown in the inbox preview line. */
  preview: string;
  webUrl: string;
  unsubscribeUrl: string;
  brand?: { logoUrl?: string | null; fontStyle?: string | null; accent?: string | null };
  /** The layout the writer picked in Settings. */
  design?: EmailDesign;
  /** For the Letter design's signature. */
  senderName?: string;
  /** Dateline for Letter and Magazine. */
  date?: Date;
  children: ReactNode;
};

const fonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
};

const ink = { text: "#1c1917", soft: "#57534e", muted: "#78716c", rule: "#e7e5e0" };

const dateline = (date: Date) =>
  new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(date);

type Shared = Required<
  Pick<
    NewsletterEmailProps,
    "publicationName" | "publicationUrl" | "title" | "webUrl" | "unsubscribeUrl"
  >
> &
  Pick<NewsletterEmailProps, "subtitle" | "senderName" | "children"> & {
    logoUrl: string | null;
    accent: string;
    date: Date;
  };

/** Every issue's frame. The body (children) is the same Markdown in every design. */
export default function NewsletterEmail({
  preview,
  brand,
  design = "classic",
  date = new Date(),
  ...props
}: NewsletterEmailProps) {
  const font = brand?.fontStyle === "serif" ? fonts.serif : fonts.sans;
  const shared: Shared = {
    ...props,
    subtitle: props.subtitle ?? null,
    logoUrl: brand?.logoUrl ?? null,
    accent: brand?.accent ?? DEFAULT_ACCENT,
    date,
  };
  const Layout = { classic: Classic, minimal: Minimal, letter: Letter, magazine: Magazine }[design];
  const background = design === "letter" ? "#f5f5f4" : "#ffffff";

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: background, fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Layout {...shared} />
      </Body>
    </Html>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function Masthead({
  name,
  url,
  logoUrl,
  logoHeight = 40,
  color = ink.text,
  fontSize = "13px",
}: {
  name: string;
  url: string;
  logoUrl: string | null;
  logoHeight?: number;
  color?: string;
  fontSize?: string;
}) {
  return (
    <Link href={url} style={{ color, fontSize, fontWeight: 600, textDecoration: "none" }}>
      {logoUrl ? (
        <Img
          src={logoUrl}
          alt={name}
          height={String(logoHeight)}
          style={{ display: "block", height: `${logoHeight}px`, width: "auto", border: 0 }}
        />
      ) : (
        name
      )}
    </Link>
  );
}

function Footer({
  publicationName,
  unsubscribeUrl,
  webUrl,
  align = "left",
  withWebLink = false,
  linkColor = ink.muted,
}: {
  publicationName: string;
  unsubscribeUrl: string;
  webUrl: string;
  align?: CSSProperties["textAlign"];
  withWebLink?: boolean;
  linkColor?: string;
}) {
  const link: CSSProperties = { color: linkColor, textDecoration: "underline" };
  return (
    <Text
      style={{
        color: ink.muted,
        fontSize: "12px",
        lineHeight: "18px",
        margin: 0,
        textAlign: align,
      }}
    >
      You&apos;re receiving this because you subscribed to {publicationName}.{" "}
      {withWebLink ? (
        <>
          <Link href={webUrl} style={link}>
            View in browser
          </Link>
          {" · "}
        </>
      ) : null}
      <Link href={unsubscribeUrl} style={link}>
        Unsubscribe
      </Link>
    </Text>
  );
}

// ─── Classic: the default ────────────────────────────────────────────────────

function Classic(p: Shared) {
  return (
    <Container style={{ maxWidth: "600px", padding: "0 20px" }}>
      <Section style={{ marginBottom: "24px" }}>
        <Row>
          <Column>
            <Masthead name={p.publicationName} url={p.publicationUrl} logoUrl={p.logoUrl} />
          </Column>
          <Column align="right">
            <Link
              href={p.webUrl}
              style={{ color: ink.muted, fontSize: "13px", textDecoration: "underline" }}
            >
              View in browser
            </Link>
          </Column>
        </Row>
      </Section>
      <Heading
        as="h1"
        style={{ color: ink.text, fontSize: "30px", lineHeight: 1.2, margin: "0 0 8px" }}
      >
        {p.title}
      </Heading>
      {p.subtitle ? (
        <Text style={{ color: ink.soft, fontSize: "18px", lineHeight: "26px", margin: 0 }}>
          {p.subtitle}
        </Text>
      ) : null}
      <Hr style={{ borderColor: ink.rule, margin: "24px 0" }} />
      <Section>{p.children}</Section>
      <Hr style={{ borderColor: ink.rule, margin: "32px 0 16px" }} />
      <Footer {...p} />
    </Container>
  );
}

// ─── Minimal: narrow, no rules, nothing but the words ────────────────────────

function Minimal(p: Shared) {
  return (
    <Container style={{ maxWidth: "560px", padding: "0 20px" }}>
      <Section style={{ marginBottom: "28px" }}>
        <Masthead
          name={p.publicationName}
          url={p.publicationUrl}
          logoUrl={p.logoUrl}
          logoHeight={28}
          color={ink.muted}
        />
      </Section>
      <Heading
        as="h1"
        style={{ color: ink.text, fontSize: "26px", lineHeight: 1.25, margin: "0 0 6px" }}
      >
        {p.title}
      </Heading>
      {p.subtitle ? (
        <Text
          style={{ color: ink.muted, fontSize: "16px", lineHeight: "24px", margin: "0 0 20px" }}
        >
          {p.subtitle}
        </Text>
      ) : (
        <Section style={{ height: "14px" }} />
      )}
      <Section>{p.children}</Section>
      <Section style={{ marginTop: "40px" }}>
        <Footer {...p} align="center" withWebLink />
      </Section>
    </Container>
  );
}

// ─── Letter: a personal note on paper, signed ────────────────────────────────

function Letter(p: Shared) {
  return (
    <Container style={{ maxWidth: "600px", padding: "0 16px" }}>
      <Section
        style={{
          backgroundColor: "#ffffff",
          border: `1px solid ${ink.rule}`,
          borderRadius: "8px",
          padding: "36px 36px 28px",
        }}
      >
        <Text style={{ color: ink.muted, fontSize: "13px", margin: "0 0 4px" }}>
          {dateline(p.date)}
        </Text>
        <Masthead
          name={p.publicationName}
          url={p.publicationUrl}
          logoUrl={p.logoUrl}
          logoHeight={32}
          color={ink.muted}
        />
        <Heading
          as="h1"
          style={{ color: ink.text, fontSize: "22px", lineHeight: 1.3, margin: "24px 0 4px" }}
        >
          {p.title}
        </Heading>
        {p.subtitle ? (
          <Text
            style={{ color: ink.soft, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}
          >
            {p.subtitle}
          </Text>
        ) : null}
        <Section style={{ marginTop: "16px" }}>{p.children}</Section>
        {p.senderName ? (
          <Text
            style={{ color: ink.text, fontSize: "16px", fontStyle: "italic", margin: "24px 0 0" }}
          >
            — {p.senderName}
          </Text>
        ) : null}
      </Section>
      <Section style={{ padding: "20px 8px 0" }}>
        <Footer {...p} align="center" withWebLink />
      </Section>
    </Container>
  );
}

// ─── Magazine: a bold masthead in your accent colour ─────────────────────────

function Magazine(p: Shared) {
  return (
    <Container style={{ maxWidth: "640px", padding: "0 16px" }}>
      <Section
        style={{ backgroundColor: p.accent, borderRadius: "6px 6px 0 0", padding: "18px 24px" }}
      >
        <Row>
          <Column>
            {/* White on the accent: the accent is checked to be readable against white. */}
            <Masthead
              name={p.publicationName.toUpperCase()}
              url={p.publicationUrl}
              logoUrl={p.logoUrl}
              logoHeight={32}
              color="#ffffff"
              fontSize="14px"
            />
          </Column>
          <Column align="right">
            <Text style={{ color: "#ffffff", fontSize: "12px", margin: 0 }}>
              {dateline(p.date)}
            </Text>
          </Column>
        </Row>
      </Section>
      <Section
        style={{ border: `1px solid ${ink.rule}`, borderTop: "0", padding: "28px 24px 24px" }}
      >
        <Heading
          as="h1"
          style={{
            color: ink.text,
            fontSize: "34px",
            fontWeight: 800,
            lineHeight: 1.15,
            margin: "0 0 10px",
          }}
        >
          {p.title}
        </Heading>
        {p.subtitle ? (
          <Text style={{ color: ink.soft, fontSize: "19px", lineHeight: "28px", margin: 0 }}>
            {p.subtitle}
          </Text>
        ) : null}
        <Hr
          style={{
            border: "none",
            borderTop: `3px solid ${p.accent}`,
            width: "48px",
            margin: "20px 0 24px",
          }}
        />
        <Section>{p.children}</Section>
        <Hr style={{ borderColor: ink.rule, margin: "28px 0 16px" }} />
        <Footer {...p} withWebLink linkColor={p.accent} />
      </Section>
    </Container>
  );
}
