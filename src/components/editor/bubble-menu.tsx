"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, Link, Strikethrough, type LucideIcon } from "lucide-react";
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
