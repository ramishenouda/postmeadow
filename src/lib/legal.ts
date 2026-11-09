/**
 * Who runs Postmeadow, for the terms and privacy pages. Fill these in before launch:
 * while any value still starts with "[", the pages show a warning banner.
 * Have a lawyer review /terms and /privacy for your country before going live.
 */
export const OPERATOR = {
  /** Person or company that operates the service. */
  name: "[Operator name]",
  /** Postal address (also usable as Postmeadow's own address in system emails). */
  address: "[Street, postcode, city]",
  country: "[Country]",
  /** Where people write about privacy, abuse and legal questions. */
  email: "[contact@postmeadow.com]",
  /** Courts/law that govern the terms, e.g. "the laws of Germany". */
  governingLaw: "[the laws of your country]",
};

/** When the terms and privacy pages last changed (shown on both). */
export const LEGAL_UPDATED = "9 November 2026";

export const hasLegalPlaceholders = () =>
  Object.values(OPERATOR).some((v) => v.trim().startsWith("["));
