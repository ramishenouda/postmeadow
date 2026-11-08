import "server-only";
import { createElement } from "react";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db, schema } from "@/db";
import { env } from "@/env";
import { APP_NAME } from "@/lib/brand";
import MagicLinkEmail from "@/emails/magic-link";
import { renderEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

const MAGIC_LINK_TTL_MINUTES = 15;

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh expiry at most once a day
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
      storeToken: "hashed",
      async sendMagicLink({ email, url }) {
        const { html, text } = await renderEmail(
          createElement(MagicLinkEmail, { url, expiresInMinutes: MAGIC_LINK_TTL_MINUTES }),
        );
        await sendEmail({ to: email, subject: `Your ${APP_NAME} sign-in link`, html, text });
      },
    }),
    // Must be last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
