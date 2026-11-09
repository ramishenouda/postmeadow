/** A sponsor placement in one issue. Stored as JSON on posts.sponsor. */
export type Sponsor = {
  name: string;
  /** A sentence or two about the sponsor, written by the writer. */
  text: string;
  url: string;
  /** Link text, e.g. "Try it free". */
  cta: string;
  /** Optional logo or product photo. */
  imageUrl?: string | null;
  position: "top" | "bottom";
};
