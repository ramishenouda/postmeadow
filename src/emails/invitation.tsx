import { Button, Heading, Link, Text } from "@react-email/components";
import { SystemLayout } from "./components/system-layout";

export type InvitationEmailProps = {
  publicationName: string;
  /** Who's inviting, e.g. the publication's sender name "Rami from The Weekly Meadow". */
  inviter: string;
  description?: string | null;
  /** The invitation page. Both buttons go there, so link scanners can't answer for the reader. */
  inviteUrl: string;
  /** Same page, opened on "No thanks". */
  declineUrl: string;
  expires: string;
  accent: string;
};

export default function InvitationEmail({
  publicationName,
  inviter,
  description,
  inviteUrl,
  declineUrl,
  expires,
  accent,
}: InvitationEmailProps) {
  return (
    <SystemLayout
      preview={`${inviter} invited you to subscribe to ${publicationName}`}
      footer={
        <>
          Nothing happens unless you accept: you won&apos;t get any newsletters from{" "}
          {publicationName}. This invitation expires on {expires}. Click &ldquo;No thanks&rdquo; and
          you won&apos;t be invited again.
        </>
      }
    >
      <Heading as="h1" style={{ color: "#1c1917", fontSize: "22px", margin: "0 0 16px" }}>
        You&apos;re invited to {publicationName}
      </Heading>
      <Text style={{ color: "#44403c", fontSize: "15px", lineHeight: "24px" }}>
        {inviter === publicationName ? (
          <>
            You&apos;ve been invited to receive <strong>{publicationName}</strong>
          </>
        ) : (
          <>
            <strong>{inviter}</strong> would like to send you <strong>{publicationName}</strong>
          </>
        )}
        {description ? `: ${description}` : "."}
      </Text>
      <Text style={{ color: "#44403c", fontSize: "15px", lineHeight: "24px" }}>
        Would you like to subscribe?
      </Text>
      <Button
        href={inviteUrl}
        style={{
          backgroundColor: accent,
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "15px",
          fontWeight: 600,
          padding: "12px 20px",
          textDecoration: "none",
        }}
      >
        Accept invitation
      </Button>
      <Text style={{ fontSize: "14px", margin: "16px 0 0" }}>
        <Link href={declineUrl} style={{ color: "#57534e", textDecoration: "underline" }}>
          No thanks
        </Link>
      </Text>
    </SystemLayout>
  );
}

InvitationEmail.PreviewProps = {
  publicationName: "The Weekly Meadow",
  inviter: "Rami from The Weekly Meadow",
  description: "Five small, useful things every Sunday.",
  inviteUrl: "http://localhost:3000/invite/example",
  declineUrl: "http://localhost:3000/invite/example?answer=no",
  expires: "November 16",
  accent: "#15803d",
} satisfies InvitationEmailProps;
