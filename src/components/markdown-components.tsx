import type { GalleryImage, MarkdownComponents } from "@/lib/markdown/render";
import { cn } from "@/lib/utils";

/** "Linen shirt · $59" → name in bold, the rest (a price, a note) after it. */
export function Caption({ title }: { title: string }) {
  const [name, ...rest] = title.split(" · ");
  return (
    <figcaption className="not-prose mt-2 text-sm leading-5">
      <span className="text-foreground font-medium">{name}</span>
      {rest.length ? <span className="text-muted-foreground"> · {rest.join(" · ")}</span> : null}
    </figcaption>
  );
}

function Figure({ image }: { image: GalleryImage }) {
  return (
    <figure className="m-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external images */}
      <img src={image.src} alt={image.alt} className="m-0 w-full" />
      {image.title ? <Caption title={image.title} /> : null}
    </figure>
  );
}

/** Markdown → plain semantic HTML, styled by Tailwind Typography (`prose`). */
export const webComponents: MarkdownComponents = {
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
  // The brand colour comes from --brand (set by <Brand>), else the app's primary.
  button: ({ href, children }) => (
    <p className="not-prose my-7">
      <a
        href={href}
        rel="noopener noreferrer nofollow"
        className="inline-block rounded-lg bg-(--brand,var(--primary)) px-6 py-3 font-semibold text-white no-underline shadow-sm transition hover:opacity-90"
      >
        {children}
      </a>
    </p>
  ),
  gallery: ({ rows }) => (
    <div className="my-8 space-y-4">
      {rows.map((row, r) => (
        <div
          key={r}
          className={cn(
            "grid gap-4",
            row.length === 2 && "grid-cols-2",
            row.length === 3 && "grid-cols-2 sm:grid-cols-3",
          )}
        >
          {row.map((image, i) => (
            <Figure key={i} image={image} />
          ))}
        </div>
      ))}
    </div>
  ),
};
