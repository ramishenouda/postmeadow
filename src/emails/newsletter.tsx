import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export type NewsletterEmailProps = {
  publicationName: string;
  publicationUrl: string;
  title: string;
  subtitle?: string | null;
  /** Shown in the inbox preview line. */
  preview: string;
  webUrl: string;
  unsubscribeUrl: string;
  children: ReactNode;
};

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export default function NewsletterEmail({
  publicationName,
  publicationUrl,
  title,
  subtitle,
  preview,
  webUrl,
  unsubscribeUrl,
  children,
}: NewsletterEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#ffffff", fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: "600px", padding: "0 20px" }}>
          <Section style={{ marginBottom: "24px" }}>
            <Row>
              <Column>
                <Link
                  href={publicationUrl}
                  style={{ color: "#1c1917", fontSize: "13px", fontWeight: 600 }}
                >
                  {publicationName}
                </Link>
              </Column>
              <Column align="right">
                <Link
                  href={webUrl}
                  style={{ color: "#78716c", fontSize: "13px", textDecoration: "underline" }}
                >
                  View in browser
                </Link>
              </Column>
            </Row>
          </Section>

          <Heading
            as="h1"
            style={{ color: "#1c1917", fontSize: "30px", lineHeight: 1.2, margin: "0 0 8px" }}
          >
            {title}
          </Heading>
          {subtitle ? (
            <Text style={{ color: "#57534e", fontSize: "18px", lineHeight: "26px", margin: 0 }}>
              {subtitle}
            </Text>
          ) : null}
          <Hr style={{ borderColor: "#e7e5e0", margin: "24px 0" }} />

          <Section>{children}</Section>

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
