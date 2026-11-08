import { Button, Heading, Link, Text } from "@react-email/components";
import { APP_NAME } from "@/lib/brand";
import { SystemLayout } from "./components/system-layout";

export type MagicLinkEmailProps = {
  url: string;
  expiresInMinutes: number;
};

export default function MagicLinkEmail({ url, expiresInMinutes }: MagicLinkEmailProps) {
  return (
    <SystemLayout
      preview="Your sign-in link"
      footer="If you didn't request this email, you can safely ignore it."
    >
      <Heading as="h1" style={{ color: "#1c1917", fontSize: "22px", margin: "0 0 16px" }}>
        Sign in to {APP_NAME}
      </Heading>
      <Text style={{ color: "#44403c", fontSize: "15px", lineHeight: "24px" }}>
        Click the button below to sign in. The link expires in {expiresInMinutes} minutes and can
        only be used once.
      </Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#1c1917",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "15px",
          fontWeight: 600,
          padding: "12px 20px",
          textDecoration: "none",
        }}
      >
        Sign in
      </Button>
      <Text style={{ color: "#78716c", fontSize: "13px", lineHeight: "20px", marginTop: "24px" }}>
        Or paste this link into your browser:
        <br />
        <Link href={url} style={{ color: "#78716c", wordBreak: "break-all" }}>
          {url}
        </Link>
      </Text>
    </SystemLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  url: "http://localhost:3000/api/auth/magic-link/verify?token=example",
  expiresInMinutes: 15,
} satisfies MagicLinkEmailProps;
