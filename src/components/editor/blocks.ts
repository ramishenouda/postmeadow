import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { galleryRows } from "@/lib/markdown/render";

/**
 * Shows the editor's content the way emails and the web will: a paragraph that is
 * only a link looks like a button, and images next to each other sit side by side
 * (2 or 3 per row). Purely visual; nothing changes in the saved Markdown.
 * The rules match src/lib/markdown/render.tsx (buttonParagraph, galleryRows).
 */

const key = new PluginKey("postmeadowBlocks");

/** A paragraph whose text is all one link. */
export function isButtonParagraph(node: PMNode): boolean {
  if (node.type.name !== "paragraph" || node.childCount === 0) return false;
  let href: string | null = null;
  let ok = true;
  node.forEach((child) => {
    if (!ok) return;
    if (child.isText && !child.text?.trim()) return;
    const link = child.marks.find((m) => m.type.name === "link");
    if (!child.isText || !link) ok = false;
    else if (href === null) href = String(link.attrs.href);
    else if (href !== link.attrs.href) ok = false;
  });
  return ok && href !== null;
}

function decorate(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  let run: { pos: number; node: PMNode }[] = [];

  const flush = () => {
    if (run.length >= 2) {
      for (const row of galleryRows(run)) {
        row.forEach(({ pos, node }, col) => {
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: `in-row row-of-${row.length}${col === row.length - 1 ? " row-end" : ""}`,
            }),
          );
        });
      }
    }
    run = [];
  };

  doc.forEach((node, pos) => {
    if (node.type.name === "image") {
      run.push({ pos, node });
      return;
    }
    flush();
    if (isButtonParagraph(node)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-button" }));
    }
  });
  flush();
  return DecorationSet.create(doc, decorations);
}

export const Blocks = Extension.create({
  name: "postmeadowBlocks",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => decorate(doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
