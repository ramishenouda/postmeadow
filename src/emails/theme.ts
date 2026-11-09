import { accentOnDark, DEFAULT_ACCENT, mixColors } from "@/lib/color";
import type { EmailDesign } from "@/lib/email-designs";

/**
 * Everything a design changes about the body of an email: colours, headings,
 * buttons, images. The layouts in newsletter.tsx and the Markdown components in
 * components/markdown-email.tsx both read it, so the frame and the words match.
 */
export type EmailTheme = {
  /** Behind the email. */
  page: string;
  /** Behind the content. */
  surface: string;
  text: string;
  muted: string;
  border: string;
  link: string;
  heading: {
    color: string;
    font?: string;
    weight: number;
    /** Section headings (H2) as small, spaced capitals: a fashion/editorial label. */
    h2Label?: boolean;
    uppercase?: boolean;
    letterSpacing?: string;
  };
  quote: string;
  code: { background: string; color: string };
  button: {
    background: string;
    color: string;
    radius: string;
    align: "left" | "center";
    uppercase?: boolean;
    border?: string;
  };
  image: { radius: string };
  /** Width of the text column in px, for laying out image rows in Outlook. */
  contentWidth: number;
};

export const emailFonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  /** High-contrast fashion serif, with safe fallbacks. */
  didone: 'Didot, "Bodoni 72", "Bodoni MT", "Playfair Display", Georgia, serif',
  /** Heavy condensed display for games. */
  arcade: 'Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif',
};

const light = {
  page: "#ffffff",
  surface: "#ffffff",
  text: "#292524",
  muted: "#57534e",
  border: "#e7e5e0",
  quote: "#e7e5e0",
  code: { background: "#f5f5f4", color: "#292524" },
};

/** Arcade's palette: a deep violet night with neon. */
export const ARCADE = {
  page: "#07060f",
  surface: "#120f24",
  raised: "#1b1736",
  border: "#2c2752",
  cyan: "#22d3ee",
  magenta: "#ff2bd6",
};

/** Launch's dark header. */
export const LAUNCH_NIGHT = "#0b1120";

export function emailTheme(design: EmailDesign, accent: string = DEFAULT_ACCENT): EmailTheme {
  const button = {
    background: accent,
    color: "#ffffff",
    radius: "6px",
    align: "left" as const,
  };
  switch (design) {
    case "minimal":
      return {
        ...light,
        link: accent,
        heading: { color: "#1c1917", weight: 700 },
        button,
        image: { radius: "4px" },
        contentWidth: 520,
      };
    case "letter":
      return {
        ...light,
        page: "#f5f5f4",
        link: accent,
        heading: { color: "#1c1917", weight: 700 },
        button,
        image: { radius: "4px" },
        contentWidth: 494,
      };
    case "magazine":
      return {
        ...light,
        link: accent,
        quote: accent,
        heading: { color: accent, weight: 800 },
        button: { ...button, radius: "4px", uppercase: true },
        image: { radius: "4px" },
        contentWidth: 558,
      };
    case "boutique":
      return {
        ...light,
        page: "#f3ede4",
        surface: "#fffdf9",
        text: "#2a241e",
        muted: "#756a5e",
        border: "#e9e0d4",
        quote: "#d8cbb9",
        link: accent,
        heading: { color: "#1f1a15", font: emailFonts.didone, weight: 400, h2Label: true },
        button: { ...button, radius: "0", align: "center", uppercase: true },
        image: { radius: "0" },
        contentWidth: 520,
      };
    case "launch":
      return {
        ...light,
        page: "#eef2f7",
        text: "#1e293b",
        muted: "#64748b",
        border: "#e2e8f0",
        quote: accent,
        link: accent,
        heading: { color: "#0f172a", weight: 700, letterSpacing: "-0.02em" },
        code: { background: LAUNCH_NIGHT, color: "#e2e8f0" },
        button: { ...button, radius: "999px" },
        image: { radius: "12px" },
        contentWidth: 536,
      };
    case "arcade": {
      const neon = accentOnDark(accent, ARCADE.surface, 7);
      return {
        page: ARCADE.page,
        surface: ARCADE.surface,
        text: "#e7e4f7",
        muted: "#a7a2c6",
        border: ARCADE.border,
        quote: neon,
        link: neon,
        heading: {
          color: neon,
          font: emailFonts.arcade,
          weight: 400,
          uppercase: true,
          letterSpacing: "0.02em",
        },
        code: { background: "#0b0918", color: "#d8d2ff" },
        button: {
          ...button,
          radius: "4px",
          uppercase: true,
          border: `2px solid ${mixColors(neon, "#ffffff", 0.2)}`,
        },
        image: { radius: "8px" },
        contentWidth: 544,
      };
    }
    case "classic":
    default:
      return {
        ...light,
        link: accent,
        heading: { color: "#1c1917", weight: 700 },
        button,
        image: { radius: "6px" },
        contentWidth: 560,
      };
  }
}
