"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useSyncExternalStore } from "react";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  CodeXml,
  Columns3,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageDialog } from "./image-dialog";
import { LinkPopover } from "./link-popover";

const noopSubscribe = () => () => {};
/** "⌘" on Apple devices, "Ctrl+" elsewhere. The server renders "Ctrl+", then the client corrects it without a hydration mismatch. */
function useModifierLabel() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"),
    () => "Ctrl+",
  );
}

export function Toolbar({
  editor,
  linkOpen,
  onLinkOpenChange,
}: {
  editor: Editor | null;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}) {
  // Subscribe only to what the toolbar shows, instead of re-rendering on every keystroke.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            block: e.isActive("heading", { level: 2 })
              ? "h2"
              : e.isActive("heading", { level: 3 })
                ? "h3"
                : "p",
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            link: e.isActive("link"),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            blockquote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            table: e.isActive("table"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  const mod = useModifierLabel();
  const disabled = !editor || !state;
  const chain = () => editor!.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b px-2 py-1.5 backdrop-blur"
    >
      <Btn
        icon={Undo2}
        label={`Undo (${mod}Z)`}
        disabled={disabled || !state?.canUndo}
        onClick={() => chain().undo().run()}
      />
      <Btn
        icon={Redo2}
        label={`Redo (${mod}Shift+Z)`}
        disabled={disabled || !state?.canRedo}
        onClick={() => chain().redo().run()}
      />
      <Divider />

      <select
        aria-label="Text style"
        disabled={disabled || state?.codeBlock}
        value={state?.block ?? "p"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else
            chain()
              .setHeading({ level: v === "h2" ? 2 : 3 })
              .run();
        }}
        className="hover:bg-muted focus-visible:ring-ring/50 h-8 rounded-md border-0 bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value="p">Paragraph</option>
        <option value="h2">Heading</option>
        <option value="h3">Subheading</option>
      </select>
      <Divider />

      <Btn
        icon={Bold}
        label={`Bold (${mod}B)`}
        active={state?.bold}
        disabled={disabled}
        onClick={() => chain().toggleBold().run()}
      />
      <Btn
        icon={Italic}
        label={`Italic (${mod}I)`}
        active={state?.italic}
        disabled={disabled}
        onClick={() => chain().toggleItalic().run()}
      />
      <Btn
        icon={Strikethrough}
        label={`Strikethrough (${mod}Shift+S)`}
        active={state?.strike}
        disabled={disabled}
        onClick={() => chain().toggleStrike().run()}
      />
      <Btn
        icon={Code}
        label={`Inline code (${mod}E)`}
        active={state?.code}
        disabled={disabled}
        onClick={() => chain().toggleCode().run()}
      />
      <LinkPopover
        editor={editor}
        open={linkOpen}
        onOpenChange={onLinkOpenChange}
        trigger={
          <Btn icon={Link} label={`Link (${mod}K)`} active={state?.link} disabled={disabled} />
        }
      />
      <Divider />

      <Btn
        icon={List}
        label="Bulleted list"
        active={state?.bulletList}
        disabled={disabled}
        onClick={() => chain().toggleBulletList().run()}
      />
      <Btn
        icon={ListOrdered}
        label="Numbered list"
        active={state?.orderedList}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <Btn
        icon={Quote}
        label="Quote"
        active={state?.blockquote}
        disabled={disabled}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <Btn
        icon={CodeXml}
        label="Code block"
        active={state?.codeBlock}
        disabled={disabled}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      <Divider />

      <ImageDialog
        editor={editor}
        trigger={<Btn icon={ImagePlus} label="Image" disabled={disabled} />}
      />
      <Btn
        icon={Minus}
        label="Divider"
        disabled={disabled}
        onClick={() => chain().setHorizontalRule().run()}
      />
      <Btn
        icon={Table}
        label="Table"
        active={state?.table}
        disabled={disabled || state?.table}
        onClick={() => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}
      />

      {state?.table ? (
        <>
          <Divider />
          <span className="text-muted-foreground px-1 text-xs">Table:</span>
          <Btn
            icon={BetweenHorizontalEnd}
            label="Add row below"
            onClick={() => chain().addRowAfter().run()}
          />
          <Btn
            icon={BetweenVerticalEnd}
            label="Add column right"
            onClick={() => chain().addColumnAfter().run()}
          />
          <Btn icon={Rows3} label="Delete row" onClick={() => chain().deleteRow().run()} />
          <Btn icon={Columns3} label="Delete column" onClick={() => chain().deleteColumn().run()} />
          <Btn icon={Trash2} label="Delete table" onClick={() => chain().deleteTable().run()} />
        </>
      ) : null}
    </div>
  );
}

function Btn({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
} & Omit<React.ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      // Keep the editor's selection when clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "text-muted-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors",
        "hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-muted text-foreground",
      )}
      {...rest}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function Divider() {
  return <span className="bg-border mx-1 h-5 w-px" aria-hidden />;
}
