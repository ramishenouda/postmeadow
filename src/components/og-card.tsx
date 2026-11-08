import { DEFAULT_ACCENT } from "@/lib/color";

/** 1200×630 social preview card (rendered by next/og, so only flexbox and inline styles). */
export function OgCard({
  publication,
  title,
  subtitle,
  accent,
}: {
  publication: string;
  title: string;
  subtitle?: string | null;
  accent?: string | null;
}) {
  const color = accent ?? DEFAULT_ACCENT;
  const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
        borderTop: `24px solid ${color}`,
        padding: "64px 72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color }}>
        {clamp(publication, 60)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 700,
            color: "#1c1917",
            lineHeight: 1.1,
          }}
        >
          {clamp(title, 90)}
        </div>
        {subtitle ? (
          <div style={{ display: "flex", fontSize: 32, color: "#57534e", lineHeight: 1.3 }}>
            {clamp(subtitle, 140)}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#a8a29e" }}>
        Published with Postmeadow
      </div>
    </div>
  );
}
