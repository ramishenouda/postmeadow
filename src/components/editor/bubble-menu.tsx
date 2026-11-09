"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, Link, Strikethrough, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Small toolbar that floats above selected text. */
export function SelectionMenu({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      // Text selections only: not images, dividers or code blocks.
      shouldShow={({ editor: e, state: s }) =>
        !s.selection.empty &&
        e.isEditable &&
        !e.isActive("image") &&
        !e.isActive("codeBlock") &&
        !e.isActive("horizontalRule")
      }
      className="bg-popover flex items-center gap-0.5 rounded-lg border p-1 shadow-md"
    >
      <Btn
        icon={Bold}
        label="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Btn
        icon={Italic}
        label="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Btn
        icon={Strikethrough}
        label="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <Btn
        icon={Code}
        label="Inline code"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <span className="bg-border mx-0.5 h-5 w-px" aria-hidden />
      <Btn icon={Link} label="Link" active={state.link} onClick={onLink} />
    </BubbleMenu>
  );
}

function Btn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-7 items-center justify-center rounded-md",
        active && "bg-muted text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * Floats under a selected image: its caption (the Markdown image title), shown under
 * the image in emails and on the web. "Name · $59" shows the name in bold.
 */
export function ImageMenu({ editor }: { editor: Editor }) {
  const image = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e.isActive("image")
        ? {
            title: String(e.getAttributes("image").title ?? ""),
            src: String(e.getAttributes("image").src ?? ""),
          }
        : null,
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageMenu"
      // Only while the writer is working on the image (not when a post opens on one).
      shouldShow={({ editor: e, view }) => e.isEditable && view.hasFocus() && e.isActive("image")}
      options={{ placement: "bottom" }}
      className="bg-popover flex items-center gap-2 rounded-lg border p-1.5 shadow-md"
    >
      {/* Keyed by image, so switching images resets the field. */}
      <CaptionField
        key={image?.src}
        initial={image?.title ?? ""}
        onChange={(title) =>
          editor
            .chain()
            .updateAttributes("image", { title: title.trim() ? title : null })
            .run()
        }
      />
    </BubbleMenu>
  );
}

function CaptionField({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground shrink-0 pl-1">Caption</span>
      <input
        value={value}
        maxLength={120}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="e.g. Linen shirt · $59"
        className="bg-background focus-visible:ring-ring/50 h-7 w-56 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
      />
    </label>
  );
}
