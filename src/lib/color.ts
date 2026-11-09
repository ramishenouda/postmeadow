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

/** Mixes two "#rrggbb" colours: t = 0 gives `a`, t = 1 gives `b`. */
export function mixColors(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(channel(a, i) * (1 - t) + channel(b, i) * t))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * The accent, lightened just enough to be readable as text on a dark background
 * (dark email designs). Accents are checked against white, so most are too dark
 * to use as-is on black.
 */
export function accentOnDark(accent: string, background: string, min = 4.5): string {
  if (!HEX_COLOR.test(accent)) return "#ffffff";
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = mixColors(accent, "#ffffff", t);
    if (contrastRatio(candidate, background) >= min) return candidate;
  }
  return "#ffffff";
}
