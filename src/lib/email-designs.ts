/**
 * The email layouts a writer can pick (Settings → Email design).
 * `hero`: a post that opens with an image shows it full width above the title.
 */
export const EMAIL_DESIGNS = {
  classic: {
    name: "Classic",
    description: "Your name and a “view in browser” link on top, clear dividers. The default.",
    hero: false,
  },
  minimal: {
    name: "Minimal",
    description: "Narrow and quiet: no dividers, a small header, nothing but the words.",
    hero: false,
  },
  letter: {
    name: "Letter",
    description: "A personal note on paper: a date, a modest title and your signature.",
    hero: false,
  },
  magazine: {
    name: "Magazine",
    description: "A bold masthead in your accent colour, a cover photo and accent headings.",
    hero: true,
  },
  boutique: {
    name: "Boutique",
    description: "Editorial and elegant: a centred masthead, a big cover photo, product rows.",
    hero: true,
  },
  launch: {
    name: "Launch",
    description: "Crisp and modern: a dark header with your colour glowing through, rounded cards.",
    hero: true,
  },
  arcade: {
    name: "Arcade",
    description: "Dark with neon: loud headlines, glowing buttons, made for game news.",
    hero: true,
  },
} as const;

export type EmailDesign = keyof typeof EMAIL_DESIGNS;

export const isEmailDesign = (v: unknown): v is EmailDesign =>
  typeof v === "string" && v in EMAIL_DESIGNS;
