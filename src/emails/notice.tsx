import { Button, Heading, Text } from "@react-email/components";
import { SystemLayout } from "./components/system-layout";

export type NoticeEmailProps = {
  title: string;
  paragraphs: string[];
  action?: { label: string; url: string };
};

/** A short account notice to a writer or an admin (a refused send, an account paused…). */
export default function NoticeEmail({ title, paragraphs, action }: NoticeEmailProps) {
  return (
    <SystemLayout preview={paragraphs[0] ?? title}>
      <Heading as="h1" style={{ color: "#1c1917", fontSize: "20px", margin: "0 0 16px" }}>
        {title}
      </Heading>
      {paragraphs.map((p, i) => (
        <Text key={i} style={{ color: "#44403c", fontSize: "15px", lineHeight: "24px" }}>
          {p}
        </Text>
      ))}
      {action ? (
        <Button
          href={action.url}
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
          {action.label}
        </Button>
      ) : null}
    </SystemLayout>
  );
}

NoticeEmail.PreviewProps = {
  title: "Your scheduled post wasn't sent",
  paragraphs: ["“Issue #12” was due at 9:00, but this month's email limit was reached."],
  action: { label: "Open the post", url: "http://localhost:3000/dashboard/posts/x" },
} satisfies NoticeEmailProps;
