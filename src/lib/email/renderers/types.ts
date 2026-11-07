/**
 * Email builders plug in here. The MVP ships one renderer ("markdown", built on
 * React Email). Others (MJML, a block editor, raw HTML) can be added later by
 * implementing EmailRenderer and registering it under their `posts.content_format`.
 * The sending pipeline only ever sees the finished { html, text }.
 */

export type RenderablePost = {
  title: string;
  subtitle: string | null;
  content: string;
  contentFormat: string;
};

export type RenderablePublication = {
  name: string;
};

export type RenderUrls = {
  publication: string;
  webVersion: string;
  /** Usually UNSUBSCRIBE_URL_PLACEHOLDER; replaced per recipient at send time. */
  unsubscribe: string;
};

export type RenderedEmail = { html: string; text: string };

export interface EmailRenderer {
  /** Matches posts.content_format. */
  format: string;
  render(input: {
    post: RenderablePost;
    publication: RenderablePublication;
    urls: RenderUrls;
  }): Promise<RenderedEmail>;
}

/**
 * Rendering once per post (not once per subscriber) keeps large sends cheap.
 * Renderers put this token where the unsubscribe URL goes; the sender swaps it
 * for each recipient's real link.
 */
export const UNSUBSCRIBE_URL_PLACEHOLDER = "https://unsubscribe.placeholder.invalid/__TOKEN__";
