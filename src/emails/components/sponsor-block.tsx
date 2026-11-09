import { Button, Img, Section, Text } from "@react-email/components";
import type { EmailDesign } from "@/lib/email-designs";
import type { Sponsor } from "@/lib/sponsor-types";
import { emailTheme } from "../theme";

/** A clearly labelled sponsor placement, styled to the issue's design. */
export function SponsorBlock({
  sponsor,
  design,
  accent,
}: {
  sponsor: Sponsor;
  design: EmailDesign;
  accent: string;
}) {
  const t = emailTheme(design, accent);
  return (
    <Section
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: "10px",
        margin: sponsor.position === "top" ? "0 0 28px" : "28px 0 8px",
        padding: "18px 20px",
      }}
    >
      <Text
        style={{
          color: t.muted,
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.16em",
          lineHeight: "16px",
          margin: "0 0 10px",
          textTransform: "uppercase",
        }}
      >
        {`Sponsored by ${sponsor.name}`}
      </Text>
      {sponsor.imageUrl ? (
        <Img
          src={sponsor.imageUrl}
          alt={sponsor.name}
          style={{
            border: 0,
            borderRadius: "6px",
            display: "block",
            height: "auto",
            margin: "0 0 12px",
            maxHeight: "200px",
            maxWidth: "100%",
          }}
        />
      ) : null}
      <Text style={{ color: t.text, fontSize: "15px", lineHeight: "24px", margin: "0 0 14px" }}>
        {sponsor.text}
      </Text>
      <Button
        href={sponsor.url}
        style={{
          backgroundColor: t.button.background,
          border: t.button.border,
          borderRadius: t.button.radius,
          color: t.button.color,
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 700,
          lineHeight: "20px",
          padding: "10px 20px",
          textDecoration: "none",
        }}
      >
        {sponsor.cta}
      </Button>
    </Section>
  );
}
