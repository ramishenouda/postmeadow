"use client";

import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import {
  CodeXml,
  MousePointerClick,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export type SlashItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

const BUTTON_LABEL = "Button text";

/** Every block "/" can insert. Each removes the typed "/query" first. */
export function slashItems(onPickImage: (editor: Editor) => void): SlashItem[] {
  const start = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);
  return [
    {
      title: "Heading",
      description: "Section heading",
      icon: Heading2,
      keywords: ["h2", "title", "heading"],
      run: (e, r) => start(e, r).setHeading({ level: 2 }).run(),
    },
    {
      title: "Subheading",
      description: "Smaller heading",
      icon: Heading3,
      keywords: ["h3", "subtitle"],
      run: (e, r) => start(e, r).setHeading({ level: 3 }).run(),
    },
    {
      title: "Bulleted list",
      description: "A simple list",
      icon: List,
      keywords: ["ul", "bullet", "unordered"],
      run: (e, r) => start(e, r).toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      description: "A list with numbers",
      icon: ListOrdered,
      keywords: ["ol", "ordered", "1."],
      run: (e, r) => start(e, r).toggleOrderedList().run(),
    },
    {
      title: "Quote",
      description: "Highlight a quotation",
      icon: Quote,
      keywords: ["blockquote", "citation"],
      run: (e, r) => start(e, r).toggleBlockquote().run(),
    },
    {
      title: "Image",
      description: "Upload or link an image",
      icon: ImagePlus,
      keywords: ["picture", "photo", "upload"],
      run: (e, r) => {
        start(e, r).run();
        onPickImage(e);
      },
    },
    {
      title: "Button",
      description: "A link that stands out",
      icon: MousePointerClick,
      keywords: ["button", "cta", "call to action", "shop", "link"],
      // A paragraph that is only a link is shown as a button (see blocks.ts).
      // The label is selected, so typing replaces it; the link popover sets the address.
      run: (e, r) => {
        start(e, r)
          .insertContent({
            type: "text",
            text: BUTTON_LABEL,
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          })
          .run();
        const to = e.state.selection.from;
        e.chain()
          .setTextSelection({ from: to - BUTTON_LABEL.length, to })
          .run();
      },
    },
    {
      title: "Divider",
      description: "A horizontal line",
      icon: Minus,
      keywords: ["hr", "separator", "line", "rule"],
      run: (e, r) => start(e, r).setHorizontalRule().run(),
    },
    {
      title: "Code block",
      description: "Preformatted code",
      icon: CodeXml,
      keywords: ["code", "pre", "snippet"],
      run: (e, r) => start(e, r).toggleCodeBlock().run(),
    },
    {
      title: "Table",
      description: "Rows and columns",
      icon: Table,
      keywords: ["grid", "columns"],
      run: (e, r) => start(e, r).insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
    },
  ];
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) => item.title.toLowerCase().includes(q) || item.keywords.some((k) => k.startsWith(q)),
  );
}

type MenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };
type MenuProps = { items: SlashItem[]; command: (item: SlashItem) => void };

const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu({ items, command }, ref) {
  const [selected, setSelected] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  // Reset the highlight when the filtered list changes.
  if (prevItems !== items) {
    setPrevItems(items);
    setSelected(0);
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-popover text-muted-foreground w-64 rounded-lg border p-3 text-sm shadow-md">
        No matching blocks
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Insert block"
      className="bg-popover max-h-80 w-64 overflow-y-auto rounded-lg border p-1 shadow-md"
    >
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={i === selected}
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(item)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm",
            i === selected && "bg-muted",
          )}
        >
          <span className="bg-background flex size-8 shrink-0 items-center justify-center rounded-md border">
            <item.icon className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block font-medium">{item.title}</span>
            <span className="text-muted-foreground block text-xs">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

/** Type "/" to insert a block. */
export const SlashCommand = Extension.create<{ onPickImage: (editor: Editor) => void }>({
  name: "slashCommand",

  addOptions() {
    return { onPickImage: () => {} };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        // Not inside code, where "/" is just a character.
        allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== "codeBlock",
        items: ({ query }) => filterSlashItems(slashItems(this.options.onPickImage), query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;

          const place = (props: SuggestionProps<SlashItem, SlashItem>) => {
            const rect = props.clientRect?.();
            const el = renderer?.element;
            if (!rect || !el) return;
            void computePosition({ getBoundingClientRect: () => rect }, el, {
              placement: "bottom-start",
              strategy: "fixed",
              middleware: [offset(6), flip(), shift({ padding: 8 })],
            }).then(({ x, y }) => {
              Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
            });
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, {
                editor: props.editor,
                props: { items: props.items, command: props.command },
              });
              Object.assign(renderer.element.style, { position: "fixed", zIndex: "50" });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps({ items: props.items, command: props.command });
              place(props);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                renderer?.element.remove();
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
