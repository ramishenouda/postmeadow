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
import { accentOnDark, DEFAULT_ACCENT, mixColors } from "@/lib/color";
import type { EmailDesign } from "@/lib/email-designs";
import type { GalleryImage } from "@/lib/markdown/render";
import { ARCADE, emailFonts, emailTheme, LAUNCH_NIGHT } from "./theme";

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
  /** The writer's postal address, in every footer (anti-spam laws require one). */
  postalAddress?: string | null;
  /** The reader's referral page, when the publication runs a referral program. */
  referUrl?: string | null;
  /** Dateline for Letter and Magazine. */
  date?: Date;
  /**
   * The post's opening image, for designs that show a cover photo above the title
   * (EMAIL_DESIGNS[design].hero). The renderer takes it out of the body.
   */
  hero?: GalleryImage | null;
  children: ReactNode;
};

const fonts = emailFonts;

/** Class names used by components/markdown-email.tsx for image rows. */
export const MOBILE_CSS = `@media only screen and (max-width: 480px) {
  .pm-col { display: block !important; width: 100% !important; padding: 0 0 14px 0 !important; }
  .pm-col img { width: 100% !important; height: auto !important; }
}`;

const ink = { text: "#1c1917", soft: "#57534e", muted: "#78716c", rule: "#e7e5e0" };

const dateline = (date: Date) =>
  new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(date);

type Shared = Required<
  Pick<
    NewsletterEmailProps,
    "publicationName" | "publicationUrl" | "title" | "webUrl" | "unsubscribeUrl"
  >
> &
  Pick<
    NewsletterEmailProps,
    "subtitle" | "senderName" | "postalAddress" | "referUrl" | "children"
  > & {
    logoUrl: string | null;
    accent: string;
    date: Date;
    hero: GalleryImage | null;
  };

/** Every issue's frame. The body (children) is the same Markdown in every design. */
export default function NewsletterEmail({
  preview,
  brand,
  design = "classic",
  date = new Date(),
  hero,
  ...props
}: NewsletterEmailProps) {
  const font = brand?.fontStyle === "serif" ? fonts.serif : fonts.sans;
  const shared: Shared = {
    ...props,
    subtitle: props.subtitle ?? null,
    logoUrl: brand?.logoUrl ?? null,
    accent: brand?.accent ?? DEFAULT_ACCENT,
    date,
    hero: hero ?? null,
  };
  const Layout = {
    classic: Classic,
    minimal: Minimal,
    letter: Letter,
    magazine: Magazine,
    boutique: Boutique,
    launch: Launch,
    arcade: Arcade,
  }[design];
  const background = emailTheme(design, shared.accent).page;

  return (
    <Html lang="en">
      <Head>
        {/* Phones: image rows stack, one image per line (clients without media queries
            keep them side by side, which still works). */}
        <style>{MOBILE_CSS}</style>
      </Head>
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

type FooterProps = {
  publicationName: string;
  unsubscribeUrl: string;
  webUrl: string;
  postalAddress?: string | null;
  referUrl?: string | null;
  align?: CSSProperties["textAlign"];
  withWebLink?: boolean;
  linkColor?: string;
  color?: string;
};

function Footer({
  publicationName,
  unsubscribeUrl,
  webUrl,
  postalAddress,
  referUrl,
  align = "left",
  withWebLink = false,
  linkColor = ink.muted,
  color = ink.muted,
}: FooterProps) {
  const link: CSSProperties = { color: linkColor, textDecoration: "underline" };
  const text: CSSProperties = { color, fontSize: "12px", lineHeight: "18px", textAlign: align };
  return (
    <>
      <Text style={{ ...text, margin: 0 }}>
        You&apos;re receiving this because you subscribed to {publicationName}.{" "}
        {withWebLink ? (
          <>
            <Link href={webUrl} style={link}>
              View in browser
            </Link>
            {" · "}
          </>
        ) : null}
        {referUrl ? (
          <>
            <Link href={referUrl} style={link}>
              Refer a friend
            </Link>
            {" · "}
          </>
        ) : null}
        <Link href={unsubscribeUrl} style={link}>
          Pause or pick topics
        </Link>
        {" · "}
        <Link href={unsubscribeUrl} style={link}>
          Unsubscribe
        </Link>
      </Text>
      {postalAddress ? (
        <Text style={{ ...text, margin: "8px 0 0", whiteSpace: "pre-line" }}>{postalAddress}</Text>
      ) : null}
    </>
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
      {p.hero ? <Hero image={p.hero} width={608} /> : null}
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

// ─── Cover photo, shared by the designs that have one ────────────────────────

function Hero({
  image,
  width,
  radius = "0",
}: {
  image: GalleryImage;
  width: number;
  radius?: string;
}) {
  return (
    <Img
      src={image.src}
      alt={image.alt}
      width={String(width)}
      style={{
        border: 0,
        borderRadius: radius,
        display: "block",
        height: "auto",
        maxWidth: "100%",
        width: "100%",
      }}
    />
  );
}

/** A row of solid colour bars, for Arcade's top edge. */
function Stripes({ colors, height = 6 }: { colors: string[]; height?: number }) {
  return (
    <Row>
      {colors.map((c) => (
        <Column
          key={c}
          style={{
            backgroundColor: c,
            height: `${height}px`,
            lineHeight: `${height}px`,
            fontSize: 0,
          }}
        >
          &nbsp;
        </Column>
      ))}
    </Row>
  );
}

// ─── Boutique: editorial, for shops and brands ───────────────────────────────

function Boutique(p: Shared) {
  const t = emailTheme("boutique", p.accent);
  const label: CSSProperties = {
    color: t.muted,
    fontSize: "11px",
    letterSpacing: "0.24em",
    margin: 0,
    textTransform: "uppercase",
  };
  return (
    <Container style={{ maxWidth: "600px" }}>
      <Section style={{ padding: "0 16px 14px", textAlign: "center" }}>
        <Link href={p.webUrl} style={{ ...label, textDecoration: "underline" }}>
          View in browser
        </Link>
      </Section>
      <Section style={{ backgroundColor: t.surface }}>
        <Section
          style={{
            borderBottom: `1px solid ${t.border}`,
            padding: "30px 24px 26px",
            textAlign: "center",
          }}
        >
          {p.logoUrl ? (
            <table role="presentation" align="center" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td>
                    <Masthead name={p.publicationName} url={p.publicationUrl} logoUrl={p.logoUrl} />
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Link
              href={p.publicationUrl}
              style={{
                color: t.heading.color,
                fontFamily: fonts.didone,
                fontSize: "28px",
                letterSpacing: "0.28em",
                textDecoration: "none",
                textTransform: "uppercase",
              }}
            >
              {p.publicationName}
            </Link>
          )}
        </Section>
        {p.hero ? <Hero image={p.hero} width={600} /> : null}
        <Section style={{ padding: "40px 40px 8px", textAlign: "center" }}>
          <Text style={label}>{dateline(p.date)}</Text>
          <Heading
            as="h1"
            style={{
              color: t.heading.color,
              fontFamily: fonts.didone,
              fontSize: "40px",
              fontWeight: 400,
              lineHeight: 1.1,
              margin: "14px 0 12px",
            }}
          >
            {p.title}
          </Heading>
          {p.subtitle ? (
            <Text style={{ color: t.muted, fontSize: "17px", lineHeight: "26px", margin: 0 }}>
              {p.subtitle}
            </Text>
          ) : null}
          <Hr
            style={{
              border: "none",
              borderTop: `1px solid ${t.heading.color}`,
              margin: "26px auto 6px",
              width: "40px",
            }}
          />
        </Section>
        <Section style={{ padding: "16px 40px 32px" }}>{p.children}</Section>
      </Section>
      <Section style={{ padding: "28px 24px 0", textAlign: "center" }}>
        <Text
          style={{
            ...label,
            color: t.heading.color,
            fontFamily: fonts.didone,
            fontSize: "14px",
            marginBottom: "10px",
          }}
        >
          {p.publicationName}
        </Text>
        <Footer {...p} align="center" color={t.muted} linkColor={t.muted} />
      </Section>
    </Container>
  );
}

// ─── Launch: modern product news ─────────────────────────────────────────────

function Launch(p: Shared) {
  const t = emailTheme("launch", p.accent);
  const glow = mixColors(p.accent, LAUNCH_NIGHT, 0.45);
  const bright = accentOnDark(p.accent, LAUNCH_NIGHT);
  return (
    <Container style={{ maxWidth: "600px", padding: "0 8px" }}>
      <Section
        style={{
          backgroundColor: LAUNCH_NIGHT,
          backgroundImage: `radial-gradient(120% 140% at 100% 0%, ${glow} 0%, ${LAUNCH_NIGHT} 62%)`,
          borderRadius: "16px 16px 0 0",
          padding: "26px 32px 36px",
        }}
      >
        <Row>
          <Column>
            <Masthead
              name={p.publicationName}
              url={p.publicationUrl}
              logoUrl={p.logoUrl}
              logoHeight={30}
              color="#ffffff"
              fontSize="15px"
            />
          </Column>
          <Column align="right">
            <Link
              href={p.webUrl}
              style={{ color: "#94a3b8", fontSize: "12px", textDecoration: "underline" }}
            >
              View in browser
            </Link>
          </Column>
        </Row>
        <Text
          style={{
            border: `1px solid ${mixColors(bright, LAUNCH_NIGHT, 0.5)}`,
            borderRadius: "999px",
            color: bright,
            display: "inline-block",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            lineHeight: "18px",
            margin: "34px 0 14px",
            padding: "3px 12px",
          }}
        >
          ● {dateline(p.date)}
        </Text>
        <Heading
          as="h1"
          style={{
            color: "#ffffff",
            fontSize: "36px",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.12,
            margin: "0 0 12px",
          }}
        >
          {p.title}
        </Heading>
        {p.subtitle ? (
          <Text style={{ color: "#cbd5e1", fontSize: "18px", lineHeight: "27px", margin: 0 }}>
            {p.subtitle}
          </Text>
        ) : null}
      </Section>
      {p.hero ? <Hero image={p.hero} width={584} /> : null}
      <Section
        style={{
          backgroundColor: t.surface,
          borderRadius: "0 0 16px 16px",
          padding: "32px 24px 28px",
        }}
      >
        {p.children}
      </Section>
      <Section style={{ padding: "24px 16px 0" }}>
        <Footer {...p} align="center" withWebLink color={t.muted} linkColor={t.muted} />
      </Section>
    </Container>
  );
}

// ─── Arcade: dark and neon, for games ────────────────────────────────────────

function Arcade(p: Shared) {
  const t = emailTheme("arcade", p.accent);
  const neon = t.heading.color;
  return (
    <Container style={{ maxWidth: "600px" }}>
      <Stripes colors={[p.accent, ARCADE.cyan, ARCADE.magenta]} />
      <Section style={{ backgroundColor: ARCADE.surface, padding: "18px 28px" }}>
        <Row>
          <Column>
            <Masthead
              name={p.publicationName.toUpperCase()}
              url={p.publicationUrl}
              logoUrl={p.logoUrl}
              logoHeight={30}
              color="#ffffff"
              fontSize="14px"
            />
          </Column>
          <Column align="right">
            <Link
              href={p.webUrl}
              style={{ color: t.muted, fontSize: "12px", textDecoration: "underline" }}
            >
              View in browser
            </Link>
          </Column>
        </Row>
      </Section>
      {p.hero ? <Hero image={p.hero} width={600} /> : null}
      <Section style={{ backgroundColor: ARCADE.surface, padding: "30px 28px 6px" }}>
        <Text
          style={{
            color: ARCADE.cyan,
            fontFamily: fonts.arcade,
            fontSize: "14px",
            letterSpacing: "0.16em",
            margin: "0 0 10px",
            textTransform: "uppercase",
          }}
        >
          ▶ {dateline(p.date)}
        </Text>
        <Heading
          as="h1"
          style={{
            color: "#ffffff",
            fontFamily: fonts.arcade,
            fontSize: "44px",
            fontWeight: 400,
            letterSpacing: "0.01em",
            lineHeight: 1.02,
            margin: "0 0 14px",
            textTransform: "uppercase",
          }}
        >
          {p.title}
        </Heading>
        {p.subtitle ? (
          <Text style={{ color: t.text, fontSize: "18px", lineHeight: "27px", margin: 0 }}>
            {p.subtitle}
          </Text>
        ) : null}
        <Hr
          style={{
            border: "none",
            borderTop: `3px solid ${neon}`,
            margin: "22px 0 0",
            width: "64px",
          }}
        />
      </Section>
      <Section style={{ backgroundColor: ARCADE.surface, padding: "20px 28px 28px" }}>
        {p.children}
      </Section>
      <Stripes colors={[ARCADE.magenta, ARCADE.cyan, p.accent]} height={4} />
      <Section style={{ padding: "24px 20px 8px" }}>
        <Footer {...p} align="center" withWebLink color={t.muted} linkColor={neon} />
      </Section>
    </Container>
  );
}
