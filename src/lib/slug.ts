/** Slugs that would collide with app routes, since publications live at /{slug}. */
export const RESERVED_SLUGS = new Set([
  "about",
  "account-deleted",
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "blog",
  "dashboard",
  "embed",
  "help",
  "invite",
  "invites",
  "media",
  "login",
  "logout",
  "new",
  "onboarding",
  "p",
  "pricing",
  "previews",
  "privacy",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signup",
  "static",
  "support",
  "templates",
  "terms",
  "unsubscribe",
  "subscription-invalid",
  "confirm",
  "www",
]);

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** "My Great Newsletter!" → "my-great-newsletter" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
