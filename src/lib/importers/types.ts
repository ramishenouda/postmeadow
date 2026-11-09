/** One post read from another platform's export, before it's converted and saved. */
export type ImportedPost = {
  /** Stable id from the source, e.g. "substack:123456". */
  key: string;
  title: string;
  subtitle: string | null;
  /** Wanted address; made unique when saving. */
  slug: string;
  html: string;
  publishedAt: Date | null;
  /** Published on the source (not a draft). */
  published: boolean;
  /** Free for everyone there (not members- or paid-only). */
  public: boolean;
  /** Turns relative links into full ones. */
  base?: string;
  /** An image to put first (Ghost's feature image). */
  coverImage?: string | null;
};

export class ImportError extends Error {}
