import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "Use at least 32 characters (openssl rand -base64 32)"),
    EMAIL_TRANSPORT: z.enum(["smtp", "resend"]).default("smtp"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1025),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().min(1),
    // Signing secret of the Resend webhook (whsec_…). Enables bounce/complaint handling.
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    // Max confirmation emails per publication per hour (backstop against sign-up abuse).
    CONFIRMATIONS_PER_PUBLICATION_PER_HOUR: z.coerce.number().int().positive().default(300),
    // Trusted header carrying the client IP (e.g. x-real-ip). See src/lib/client-ip.ts.
    CLIENT_IP_HEADER: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((e) => !e.BETTER_AUTH_SECRET.startsWith("change-me"), {
    message: "Replace the placeholder BETTER_AUTH_SECRET from .env.example",
    path: ["BETTER_AUTH_SECRET"],
  })
  .refine((e) => e.EMAIL_TRANSPORT !== "resend" || !!e.RESEND_API_KEY, {
    message: "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend",
    path: ["RESEND_API_KEY"],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
  throw new Error("Invalid environment variables. See .env.example.");
}

/** Validated server-side environment. Never import from client components. */
export const env = parsed.data;
