import "server-only";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

/** Render a React Email component to the HTML + plain-text pair every email needs. */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
