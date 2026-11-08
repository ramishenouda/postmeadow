import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export type WelcomeEmailProps = {
  publicationName: string;
  publicationUrl: string;
  unsubscribeUrl: string;
  brand: { logoUrl?: string | null; accent: string; fontStyle?: string | null };
  /** The writer's welcome message, already rendered from Markdown. */
  children: ReactNode;
};

const fonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
};

/** Sent once, when a reader confirms their subscription. */
export default function WelcomeEmail({
  publicationName,
  publicationUrl,
  unsubscribeUrl,
  brand,
  children,
}: WelcomeEmailProps) {
  const font = brand.fontStyle === "serif" ? fonts.serif : fonts.sans;
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Welcome to ${publicationName}`}</Preview>
      <Body style={{ backgroundColor: "#ffffff", fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: "600px", padding: "0 20px" }}>
          <Section style={{ marginBottom: "24px" }}>
            <Link
              href={publicationUrl}
              style={{ color: "#1c1917", fontWeight: 600, fontSize: "13px" }}
            >
              {brand.logoUrl ? (
                <Img
                  src={brand.logoUrl}
                  alt={publicationName}
                  height="40"
                  style={{ display: "block", height: "40px", width: "auto", border: 0 }}
                />
              ) : (
                publicationName
              )}
            </Link>
          </Section>
          <Heading
            as="h1"
            style={{ color: "#1c1917", fontSize: "26px", lineHeight: 1.25, margin: "0 0 16px" }}
          >
            Welcome to {publicationName}!
          </Heading>
          <Section>{children}</Section>
          <Text style={{ margin: "8px 0 0" }}>
            <Link
              href={publicationUrl}
              style={{
                backgroundColor: brand.accent,
                borderRadius: "6px",
                color: "#ffffff",
                display: "inline-block",
                fontSize: "15px",
                fontWeight: 600,
                padding: "10px 18px",
                textDecoration: "none",
              }}
            >
              Read past issues
            </Link>
          </Text>
          <Hr style={{ borderColor: "#e7e5e0", margin: "32px 0 16px" }} />
          <Text style={{ color: "#78716c", fontSize: "12px", lineHeight: "18px", margin: 0 }}>
            You&apos;re receiving this because you subscribed to {publicationName}.{" "}
            <Link href={unsubscribeUrl} style={{ color: "#78716c", textDecoration: "underline" }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
