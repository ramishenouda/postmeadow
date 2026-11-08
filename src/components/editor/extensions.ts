import type { AnyExtension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

/**
 * Only formatting that survives a round trip through Markdown AND is supported
 * by the email renderer (src/lib/markdown/render.tsx) is enabled here.
 * Underline, for example, has no Markdown syntax, so it is left out; it would
 * silently disappear on save.
 */

const SAFE_URL = /^(https?:|mailto:)/i;

/** Shared by the editor and the round-trip tests. */
export function contentExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] }, // the post title is the H1
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url) => SAFE_URL.test(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
    }),
    Image.configure({ allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
  ];
}

export function editorExtensions(placeholder: string): AnyExtension[] {
  return [...contentExtensions(), Placeholder.configure({ placeholder }), CharacterCount];
}
