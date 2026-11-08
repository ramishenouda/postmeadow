"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { editorExtensions } from "./extensions";
import { Toolbar } from "./toolbar";

/**
 * WYSIWYG editor that reads and writes Markdown, so stored posts, the email
 * renderer and the web archive are unchanged by the switch from a textarea.
 */
export function RichEditor({
  initialMarkdown,
  onChange,
  placeholder = "Start writing… Type ## for a heading, - for a list, > for a quote.",
  className,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: editorExtensions(placeholder),
    content: initialMarkdown,
    contentType: "markdown",
    // Render on the client only; avoids SSR hydration mismatches.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Post content",
        class: "prose prose-stone max-w-none min-h-[50vh] px-1 py-4 focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getMarkdown()),
  });

  return (
    <div className={cn("bg-background rounded-xl border", className)}>
      <Toolbar editor={editor} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} />
      <div className="px-4 sm:px-6">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="text-muted-foreground min-h-[50vh] py-4">Loading editor…</div>
        )}
      </div>
      {editor ? <WordCount words={editor.storage.characterCount.words()} /> : null}
    </div>
  );
}

function WordCount({ words }: { words: number }) {
  return (
    <div className="text-muted-foreground border-t px-4 py-2 text-xs sm:px-6">
      {words.toLocaleString("en")} {words === 1 ? "word" : "words"} · about{" "}
      {Math.max(1, Math.round(words / 230))} min read
    </div>
  );
}
