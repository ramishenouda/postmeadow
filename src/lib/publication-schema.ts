import { z } from "zod";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/slug";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/** Fields a writer can edit any time. */
export const publicationSettingsSchema = z.object({
  name: z.string().trim().min(1, "Give your publication a name").max(80),
  description: optionalText(280),
  fromName: z.string().trim().min(1, "Enter the name subscribers will see").max(80),
  replyTo: z
    .union([z.literal(""), z.email("Enter a valid email address")])
    .transform((v) => v || null),
});

/** Settings plus the address, which is chosen once at creation. */
export const newPublicationSchema = publicationSettingsSchema.extend({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      SLUG_PATTERN,
      "3–40 characters: lowercase letters, numbers and dashes, not starting or ending with a dash",
    )
    .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved. Pick another."),
});

/** First error message per field. */
export function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(z.flattenError(error).fieldErrors)) {
    const first = (messages as string[] | undefined)?.[0];
    if (first) out[key] = first;
  }
  return out;
}
