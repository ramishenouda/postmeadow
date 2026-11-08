import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";

const styles = {
  body: {
    backgroundColor: "#f6f6f4",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: "32px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e0",
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "480px",
    padding: "32px",
  },
  brand: { color: "#1c1917", fontSize: "16px", fontWeight: 600, margin: "0 0 24px" },
  hr: { borderColor: "#e7e5e0", margin: "32px 0 16px" },
  footer: { color: "#78716c", fontSize: "12px", lineHeight: "18px", margin: 0 },
} as const;

/** Shared shell for system emails (sign-in, confirmations). Not for newsletter issues. */
export function SystemLayout({
  preview,
  footer,
  children,
}: {
  preview: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{APP_NAME}</Text>
          <Section>{children}</Section>
          {footer ? (
            <>
              <Hr style={styles.hr} />
              <Text style={styles.footer}>{footer}</Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
