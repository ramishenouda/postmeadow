/** The email layouts a writer can pick (Settings → Email design). */
export const EMAIL_DESIGNS = {
  classic: {
    name: "Classic",
    description: "Your name and a “view in browser” link on top, clear dividers. The default.",
  },
  minimal: {
    name: "Minimal",
    description: "Narrow and quiet: no dividers, a small header, nothing but the words.",
  },
  letter: {
    name: "Letter",
    description: "A personal note on paper: a date, a modest title and your signature.",
  },
  magazine: {
    name: "Magazine",
    description: "A bold masthead in your accent colour, a big title and accent headings.",
  },
} as const;

export type EmailDesign = keyof typeof EMAIL_DESIGNS;

export const isEmailDesign = (v: unknown): v is EmailDesign =>
  typeof v === "string" && v in EMAIL_DESIGNS;
