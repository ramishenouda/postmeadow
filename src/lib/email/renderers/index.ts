import "server-only";
import { markdownRenderer } from "./markdown";
import type { EmailRenderer } from "./types";

export * from "./types";

const renderers = new Map<string, EmailRenderer>([[markdownRenderer.format, markdownRenderer]]);

export function getEmailRenderer(format: string): EmailRenderer {
  const renderer = renderers.get(format);
  if (!renderer) throw new Error(`No email renderer registered for content format "${format}"`);
  return renderer;
}
