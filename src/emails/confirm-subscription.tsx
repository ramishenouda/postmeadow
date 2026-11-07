import { Button, Heading, Link, Text } from "@react-email/components";
import { SystemLayout } from "./components/system-layout";

export type ConfirmSubscriptionEmailProps = {
  publicationName: string;
  confirmUrl: string;
};

export default function ConfirmSubscriptionEmail({
  publicationName,
  confirmUrl,
}: ConfirmSubscriptionEmailProps) {
  return (
    <SystemLayout
      preview={`Confirm your subscription to ${publicationName}`}
      footer="If you didn't sign up, ignore this email and you won't be subscribed."
    >
      <Heading as="h1" style={{ color: "#1c1917", fontSize: "22px", margin: "0 0 16px" }}>
        Confirm your subscription
      </Heading>
      <Text style={{ color: "#44403c", fontSize: "15px", lineHeight: "24px" }}>
        Someone (hopefully you) asked to subscribe this address to{" "}
        <strong>{publicationName}</strong>. Click below to confirm.
      </Text>
      <Button
        href={confirmUrl}
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
        Yes, subscribe me
      </Button>
      <Text style={{ color: "#78716c", fontSize: "13px", lineHeight: "20px", marginTop: "24px" }}>
        Or paste this link into your browser:
        <br />
        <Link href={confirmUrl} style={{ color: "#78716c", wordBreak: "break-all" }}>
          {confirmUrl}
        </Link>
      </Text>
    </SystemLayout>
  );
}

ConfirmSubscriptionEmail.PreviewProps = {
  publicationName: "The Weekly Byte",
  confirmUrl: "http://localhost:3000/api/subscriptions/confirm?token=example",
} satisfies ConfirmSubscriptionEmailProps;
