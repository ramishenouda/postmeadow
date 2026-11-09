import { z } from "zod";
import type { Sponsor } from "./sponsor-types";

export type { Sponsor } from "./sponsor-types";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), "Use a full web address starting with https://");

export const sponsorInput = z.object({
  name: z.string().trim().min(1, "Add the sponsor's name").max(80),
  text: z.string().trim().min(1, "Say a sentence about the sponsor").max(400),
  url: httpUrl,
  cta: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || "Learn more"),
  imageUrl: z
    .union([httpUrl, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  position: z.enum(["top", "bottom"]).default("top"),
});

export type SponsorInput = z.input<typeof sponsorInput>;

/** A valid sponsor, or null for anything malformed (old or hand-edited data). */
export function readSponsor(value: unknown): Sponsor | null {
  const parsed = sponsorInput.safeParse(value);
  return parsed.success ? parsed.data : null;
}
