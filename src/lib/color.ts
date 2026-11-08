/** Default accent when a publication hasn't picked one: readable blue for links. */
export const DEFAULT_ACCENT = "#1d4ed8";

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#rrggbb" colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The accent is used for link text on white and behind white button text, so it
 * must reach WCAG AA for normal text (4.5:1) against white.
 */
export const MIN_ACCENT_CONTRAST = 4.5;

export function accentIsReadable(hex: string): boolean {
  return HEX_COLOR.test(hex) && contrastRatio(hex, "#ffffff") >= MIN_ACCENT_CONTRAST;
}
