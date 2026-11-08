import { Heading, Hr, Img, Link, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { DEFAULT_ACCENT } from "@/lib/color";
import type { MarkdownComponents } from "@/lib/markdown/render";

/** Markdown → React Email. Every style is inline so Gmail/Outlook keep it. */

const color = { text: "#292524", muted: "#57534e", border: "#e7e5e0" };
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const headingSizes: Record<number, string> = {
  1: "26px",
  2: "22px",
  3: "19px",
  4: "17px",
  5: "16px",
  6: "15px",
};

const cell = (align: string | null, header: boolean): CSSProperties => ({
  border: `1px solid ${color.border}`,
  padding: "6px 10px",
  textAlign: (align ?? "left") as CSSProperties["textAlign"],
  fontWeight: header ? 600 : 400,
  fontSize: "14px",
});

/** Components for a publication's brand. `accent` colours links. */
export function createEmailMarkdownComponents({
  accent = DEFAULT_ACCENT,
}: { accent?: string } = {}): MarkdownComponents {
  return {
    paragraph: ({ children }) => (
      <Text style={{ color: color.text, fontSize: "16px", lineHeight: "26px", margin: "0 0 16px" }}>
        {children}
      </Text>
    ),
    heading: ({ level, children }) => (
      <Heading
        as={`h${level}`}
        style={{
          color: color.text,
          fontSize: headingSizes[level],
          lineHeight: 1.3,
          margin: "28px 0 12px",
        }}
      >
        {children}
      </Heading>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: `3px solid ${color.border}`,
          color: color.muted,
          margin: "0 0 16px",
          padding: "0 0 0 16px",
        }}
      >
        {children}
      </blockquote>
    ),
    list: ({ ordered, start, children }) => {
      const style: CSSProperties = {
        color: color.text,
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
          backgroundColor: "#f5f5f4",
          border: `1px solid ${color.border}`,
          borderRadius: "6px",
          color: color.text,
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
          backgroundColor: "#f5f5f4",
          borderRadius: "4px",
          fontFamily: mono,
          fontSize: "0.9em",
          padding: "1px 4px",
        }}
      >
        {value}
      </code>
    ),
    thematicBreak: () => <Hr style={{ borderColor: color.border, margin: "28px 0" }} />,
    link: ({ href, children }) => (
      <Link href={href} style={{ color: accent, textDecoration: "underline" }}>
        {children}
      </Link>
    ),
    image: ({ src, alt, title }) => (
      <Img
        src={src}
        alt={alt}
        title={title ?? undefined}
        style={{
          border: 0,
          display: "block",
          height: "auto",
          margin: "0 0 16px",
          maxWidth: "100%",
        }}
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
        style={{ borderCollapse: "collapse", color: color.text, margin: "0 0 16px", width: "100%" }}
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
  };
}

/** Default (unbranded) components. */
export const emailMarkdownComponents = createEmailMarkdownComponents();
