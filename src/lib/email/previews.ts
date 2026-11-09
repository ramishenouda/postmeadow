import "server-only";
import { cacheLife } from "next/cache";
import { env } from "@/env";
import { EMAIL_DESIGNS, type EmailDesign } from "@/lib/email-designs";
import { markdownRenderer } from "@/lib/email/renderers/markdown";
import {
  ASSETS,
  starterContent,
  starterTemplate,
  type StarterTemplate,
} from "@/lib/post-templates";

/**
 * Real emails, rendered from starter templates, for previews: the template gallery
 * (New post), the design picker (Settings) and the landing page. Served by
 * /previews/… and shown in iframes, so they look exactly like what readers get.
 */

export type PreviewBrand = {
  name: string;
  accentColor: string | null;
  logoUrl: string | null;
  fontStyle: string;
  fromName: string | null;
};

/** Made-up brands for the landing page, one per kind of template. */
const EXAMPLE_BRANDS: Record<string, PreviewBrand> = {
  "new-collection": brand("Fern & Field", "#9a3412", "Mara at Fern & Field"),
  "product-launch": brand("Circuit", "#4f46e5", "The Circuit team"),
  "game-update": brand("Neon Drop", "#7c3aed", "The Neon Drop crew"),
};
const DEFAULT_EXAMPLE_BRAND = brand("The Weekly Meadow", "#15803d", "Rami", "serif");

function brand(name: string, accentColor: string, fromName: string, fontStyle = "sans") {
  return { name, accentColor, logoUrl: null, fontStyle, fromName };
}

/**
 * A general-purpose issue with a photo, a list and a button, for designs that have no
 * template of their own (and for comparing designs side by side).
 */
const SAMPLE: StarterTemplate = {
  id: "sample",
  name: "Sample issue",
  description: "",
  category: "Writers",
  title: "Five things worth your Sunday",
  subtitle: "A colourful find, a good read and the tool everyone asks about",
  content: `![A rail of colourful patterned shirts](${ASSETS}/fashion/rack.jpg)

Good morning, and welcome to this week's issue. Here's what caught my eye.

## The big idea

Small, regular habits beat big plans. This week I tried planning just three things each Monday, and it worked better than any app.

- **Read:** an essay on slow software
- **Try:** a paper notebook for a week
- **Listen:** a podcast about craft

[Read the full issue](https://example.com)

That's all for this week. Reply and tell me what you're up to.`,
};

/** The template that shows each design at its best. */
const DESIGN_TEMPLATE: Partial<Record<EmailDesign, string>> = {
  boutique: "new-collection",
  launch: "product-launch",
  arcade: "game-update",
};

export function sampleFor(design: EmailDesign): StarterTemplate {
  const id = DESIGN_TEMPLATE[design];
  return (id && starterTemplate(id)) || SAMPLE;
}

async function render(template: StarterTemplate, design: EmailDesign, b: PreviewBrand) {
  const appUrl = env.APP_URL;
  const { html } = await markdownRenderer.render({
    post: {
      title: template.title,
      subtitle: template.subtitle || null,
      content: starterContent(template, appUrl),
      contentFormat: "markdown",
      emailDesign: design,
    },
    publication: { ...b, emailDesign: design },
    urls: { publication: appUrl, webVersion: appUrl, unsubscribe: appUrl },
  });
  return html;
}

/** A starter template in its own design (or `fallback`), for a writer's brand. */
export async function templatePreviewHtml(
  templateId: string,
  b: PreviewBrand,
  fallback: EmailDesign,
): Promise<string | null> {
  "use cache";
  cacheLife("days");
  const template = templateId === SAMPLE.id ? SAMPLE : starterTemplate(templateId);
  if (!template) return null;
  return render(template, template.design ?? fallback, b);
}

/** One design with the content that suits it, for a writer's brand (design picker). */
export async function designPreviewHtml(design: EmailDesign, b: PreviewBrand): Promise<string> {
  "use cache";
  cacheLife("days");
  return render(sampleFor(design), design, b);
}

/** A starter template as a made-up brand would send it (landing page). */
export async function examplePreviewHtml(templateId: string): Promise<string | null> {
  "use cache";
  cacheLife("days");
  const template = templateId === SAMPLE.id ? SAMPLE : starterTemplate(templateId);
  if (!template) return null;
  const b = EXAMPLE_BRANDS[templateId] ?? DEFAULT_EXAMPLE_BRAND;
  return render(template, template.design ?? "magazine", b);
}

export const isPreviewDesign = (v: string | null): v is EmailDesign =>
  v !== null && v in EMAIL_DESIGNS;
