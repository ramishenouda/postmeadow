import { parseMarkdown } from "@/lib/markdown/parse";
import { renderMarkdownTree, type MarkdownComponents } from "@/lib/markdown/render";
import { cn } from "@/lib/utils";

/** Markdown → plain semantic HTML, styled by Tailwind Typography (`prose`). */
const webComponents: MarkdownComponents = {
  paragraph: ({ children }) => <p>{children}</p>,
  heading: ({ level, children }) => {
    const Tag = `h${level}` as const;
    return <Tag>{children}</Tag>;
  },
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  list: ({ ordered, start, children }) =>
    ordered ? <ol start={start}>{children}</ol> : <ul>{children}</ul>,
  listItem: ({ checked, children }) => (
    <li>
      {checked === null ? null : (
        <input type="checkbox" checked={checked} readOnly disabled className="mr-2 align-middle" />
      )}
      {children}
    </li>
  ),
  code: ({ value, lang }) => (
    <pre>
      <code data-language={lang ?? undefined}>{value}</code>
    </pre>
  ),
  inlineCode: ({ value }) => <code>{value}</code>,
  thematicBreak: () => <hr />,
  link: ({ href, children }) => (
    <a href={href} rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  // eslint-disable-next-line @next/next/no-img-element -- arbitrary external images
  image: ({ src, alt, title }) => <img src={src} alt={alt} title={title ?? undefined} />,
  emphasis: ({ children }) => <em>{children}</em>,
  strong: ({ children }) => <strong>{children}</strong>,
  strikethrough: ({ children }) => <del>{children}</del>,
  lineBreak: () => <br />,
  table: ({ head, rows, align }) => (
    <table>
      <thead>
        {head.map((row, r) => (
          <tr key={r}>
            {row.map((content, i) => (
              <th key={i} style={{ textAlign: align[i] ?? undefined }}>
                {content}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((content, i) => (
              <td key={i} style={{ textAlign: align[i] ?? undefined }}>
                {content}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("prose prose-stone max-w-none", className)}>
      {renderMarkdownTree(parseMarkdown(content), webComponents)}
    </div>
  );
}
