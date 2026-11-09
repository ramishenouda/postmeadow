import {
  Button,
  Column,
  Heading,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties } from "react";
import { DEFAULT_ACCENT } from "@/lib/color";
import type { EmailDesign } from "@/lib/email-designs";
import type { GalleryImage, MarkdownComponents } from "@/lib/markdown/render";
import { emailTheme, type EmailTheme } from "../theme";

/** Markdown → React Email. Every style is inline so Gmail/Outlook keep it. */

const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const headingSizes: Record<number, string> = {
  1: "26px",
  2: "22px",
  3: "19px",
  4: "17px",
  5: "16px",
  6: "15px",
};

/** Space between images in a row. */
const GAP = 12;

/** Components for a publication's brand and chosen design. */
export function createEmailMarkdownComponents({
  accent = DEFAULT_ACCENT,
  design = "classic",
}: {
  accent?: string;
  design?: EmailDesign;
} = {}): MarkdownComponents {
  const t = emailTheme(design, accent);

  const cell = (align: string | null, header: boolean): CSSProperties => ({
    border: `1px solid ${t.border}`,
    color: t.text,
    padding: "6px 10px",
    textAlign: (align ?? "left") as CSSProperties["textAlign"],
    fontWeight: header ? 600 : 400,
    fontSize: "14px",
  });

  return {
    paragraph: ({ children }) => (
      <Text style={{ color: t.text, fontSize: "16px", lineHeight: "26px", margin: "0 0 16px" }}>
        {children}
      </Text>
    ),
    heading: ({ level, children }) => (
      <Heading as={`h${level}`} style={headingStyle(t, level)}>
        {children}
      </Heading>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: `3px solid ${t.quote}`,
          color: t.muted,
          margin: "0 0 16px",
          padding: "0 0 0 16px",
        }}
      >
        {children}
      </blockquote>
    ),
    list: ({ ordered, start, children }) => {
      const style: CSSProperties = {
        color: t.text,
        fontSize: "16px",
        lineHeight: "26px",
        margin: "0 0 16px",
        paddingLeft: "24px",
      };
      return ordered ? (
        <ol start={start} style={style}>
          {children}
        </ol>
      ) : (
        <ul style={style}>{children}</ul>
      );
    },
    listItem: ({ checked, children }) => (
      <li style={{ margin: "0 0 4px" }}>
        {checked === null ? null : checked ? "☑ " : "☐ "}
        {children}
      </li>
    ),
    code: ({ value }) => (
      <pre
        style={{
          backgroundColor: t.code.background,
          border: `1px solid ${t.border}`,
          borderRadius: "6px",
          color: t.code.color,
          fontFamily: mono,
          fontSize: "13px",
          lineHeight: "20px",
          margin: "0 0 16px",
          overflowX: "auto",
          padding: "12px 14px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value}
      </pre>
    ),
    inlineCode: ({ value }) => (
      <code
        style={{
          backgroundColor: t.code.background,
          borderRadius: "4px",
          color: t.code.color,
          fontFamily: mono,
          fontSize: "0.9em",
          padding: "1px 4px",
        }}
      >
        {value}
      </code>
    ),
    thematicBreak: () => <Hr style={{ borderColor: t.border, margin: "28px 0" }} />,
    link: ({ href, children }) => (
      <Link href={href} style={{ color: t.link, textDecoration: "underline" }}>
        {children}
      </Link>
    ),
    // Images normally arrive through `gallery` (even a lone one). This covers images
    // inside text, e.g. an icon in the middle of a sentence.
    image: ({ src, alt, title }) => (
      <Img
        src={src}
        alt={alt}
        title={title ?? undefined}
        style={{ border: 0, display: "inline-block", height: "auto", maxWidth: "100%" }}
      />
    ),
    emphasis: ({ children }) => <em>{children}</em>,
    strong: ({ children }) => <strong>{children}</strong>,
    strikethrough: ({ children }) => <del>{children}</del>,
    lineBreak: () => <br />,
    table: ({ head, rows, align }) => (
      <table
        cellPadding={0}
        cellSpacing={0}
        role="presentation"
        style={{ borderCollapse: "collapse", color: t.text, margin: "0 0 16px", width: "100%" }}
      >
        <tbody>
          {head.map((row, r) => (
            <tr key={`h${r}`}>
              {row.map((content, i) => (
                <th key={i} style={cell(align[i] ?? null, true)}>
                  {content}
                </th>
              ))}
            </tr>
          ))}
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((content, i) => (
                <td key={i} style={cell(align[i] ?? null, false)}>
                  {content}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    button: ({ href, children }) => (
      <Section style={{ margin: "8px 0 24px", textAlign: t.button.align }}>
        <Button
          href={href}
          style={{
            backgroundColor: t.button.background,
            border: t.button.border,
            borderRadius: t.button.radius,
            color: t.button.color,
            display: "inline-block",
            fontSize: t.button.uppercase ? "13px" : "15px",
            fontWeight: 700,
            letterSpacing: t.button.uppercase ? "0.12em" : undefined,
            lineHeight: "20px",
            padding: "14px 28px",
            textDecoration: "none",
            textTransform: t.button.uppercase ? "uppercase" : undefined,
          }}
        >
          {children}
        </Button>
      </Section>
    ),
    gallery: ({ rows }) => (
      <Section style={{ margin: "8px 0 20px" }}>
        {rows.map((row, r) =>
          row.length === 1 ? (
            <Figure key={r} image={row[0]} theme={t} />
          ) : (
            <Row key={r} style={{ marginBottom: r < rows.length - 1 ? `${GAP}px` : 0 }}>
              {row.map((image, i) => {
                const width = Math.floor((t.contentWidth - GAP * (row.length - 1)) / row.length);
                return (
                  <Column
                    key={i}
                    className="pm-col"
                    valign="top"
                    // Gaps split so every column's content is the same width:
                    // with 3 columns, 0+8 | 4+4 | 8+0.
                    style={{
                      paddingLeft: `${(GAP * i) / row.length}px`,
                      paddingRight: `${(GAP * (row.length - 1 - i)) / row.length}px`,
                      verticalAlign: "top",
                      width: `${100 / row.length}%`,
                    }}
                  >
                    <Figure image={image} theme={t} width={width} />
                  </Column>
                );
              })}
            </Row>
          ),
        )}
      </Section>
    ),
  };
}

/** Default (unbranded) components. */
export const emailMarkdownComponents = createEmailMarkdownComponents();

function headingStyle(t: EmailTheme, level: number): CSSProperties {
  const h = t.heading;
  if (h.h2Label && level === 2) {
    // A spaced, small-caps section label with a hairline under it.
    return {
      borderBottom: `1px solid ${t.border}`,
      color: h.color,
      fontSize: "13px",
      fontWeight: 600,
      letterSpacing: "0.22em",
      lineHeight: "20px",
      margin: "36px 0 18px",
      paddingBottom: "10px",
      textAlign: "center",
      textTransform: "uppercase",
    };
  }
  return {
    color: h.color,
    fontFamily: h.font,
    fontSize: h.uppercase && level === 2 ? "26px" : headingSizes[level],
    fontWeight: h.weight,
    letterSpacing: h.letterSpacing,
    lineHeight: 1.25,
    margin: "28px 0 12px",
    textTransform: h.uppercase ? "uppercase" : undefined,
  };
}

/** An image with an optional caption ("Name · $59"). `width` fixes it for Outlook. */
function Figure({
  image,
  theme: t,
  width,
}: {
  image: GalleryImage;
  theme: EmailTheme;
  width?: number;
}) {
  const [name, ...rest] = image.title?.split(" · ") ?? [];
  const label = t.heading.h2Label; // the editorial (Boutique) caption style
  return (
    <>
      <Img
        src={image.src}
        alt={image.alt}
        width={width ? String(width) : undefined}
        style={{
          border: 0,
          borderRadius: t.image.radius,
          display: "block",
          height: "auto",
          maxWidth: "100%",
          width: width ? "100%" : undefined,
        }}
      />
      {name ? (
        <Text
          style={{
            color: t.text,
            fontSize: label ? "12px" : "14px",
            letterSpacing: label ? "0.14em" : undefined,
            lineHeight: "20px",
            margin: "10px 0 0",
            textAlign: label ? "center" : "left",
            textTransform: label ? "uppercase" : undefined,
          }}
        >
          <strong style={{ fontWeight: 600 }}>{name}</strong>
          {rest.length ? (
            <>
              <br />
              <span style={{ color: t.muted, letterSpacing: 0, textTransform: "none" }}>
                {rest.join(" · ")}
              </span>
            </>
          ) : null}
        </Text>
      ) : null}
    </>
  );
}
