"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ImageMenu, SelectionMenu } from "./bubble-menu";
import { editorExtensions, IMAGE_FILES_EVENT, PICK_IMAGE_EVENT } from "./extensions";
import { ImageDialog } from "./image-dialog";
import { Toolbar } from "./toolbar";
import { uploadImage } from "./upload";

/**
 * WYSIWYG editor that reads and writes Markdown, so stored posts, the email
 * renderer and the web archive don't depend on the editor.
 */
export function RichEditor({
  initialMarkdown,
  onChange,
  placeholder = "Start writing, or type / to insert a heading, image, list…",
  className,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // Listen for what the editor's extensions ask the UI to do.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    /** Pasted or dropped image files: upload each, then insert it where it landed. */
    const onFiles = async (event: Event) => {
      const { files, pos } = (event as CustomEvent<{ files: File[]; pos?: number }>).detail;
      setUploadError(null);
      let at = pos;
      for (const file of files) {
        setUploading((n) => n + 1);
        try {
          const image = await uploadImage(file);
          const node = { type: "image", attrs: { src: image.url, alt: "" } };
          if (at === undefined) {
            editor.chain().focus().insertContent(node).run();
          } else {
            editor.chain().focus().insertContentAt(at, node).run();
            at += 1;
          }
        } catch (error) {
          setUploadError((error as Error).message);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    };
    const onPick = () => setImageOpen(true);

    dom.addEventListener(IMAGE_FILES_EVENT, onFiles);
    dom.addEventListener(PICK_IMAGE_EVENT, onPick);
    return () => {
      dom.removeEventListener(IMAGE_FILES_EVENT, onFiles);
      dom.removeEventListener(PICK_IMAGE_EVENT, onPick);
    };
  }, [editor]);

  return (
    <div className={cn("bg-background rounded-xl border", className)}>
      <Toolbar
        editor={editor}
        linkOpen={linkOpen}
        onLinkOpenChange={setLinkOpen}
        onImageClick={() => setImageOpen(true)}
        uploading={uploading}
      />
      {uploadError ? (
        <div
          role="alert"
          className="bg-destructive/5 text-destructive flex items-start justify-between gap-3 border-b px-4 py-2 text-sm sm:px-6"
        >
          <span>{uploadError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setUploadError(null)}
            className="hover:bg-destructive/10 shrink-0 rounded p-0.5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      <div className="px-4 sm:px-6">
        {editor ? (
          <>
            <EditorContent editor={editor} />
            <SelectionMenu editor={editor} onLink={() => setLinkOpen(true)} />
            <ImageMenu editor={editor} />
          </>
        ) : (
          <div className="text-muted-foreground min-h-[50vh] py-4">Loading editor…</div>
        )}
      </div>
      {editor ? <WordCount words={editor.storage.characterCount.words()} /> : null}
      <ImageDialog editor={editor} open={imageOpen} onOpenChange={setImageOpen} />
    </div>
  );
}

function WordCount({ words }: { words: number }) {
  return (
    <div className="text-muted-foreground border-t px-4 py-2 text-xs sm:px-6">
      {words.toLocaleString("en")} {words === 1 ? "word" : "words"} · about{" "}
      {Math.max(1, Math.round(words / 230))} min read · Type <kbd>/</kbd> for blocks, paste or drop
      images to upload
    </div>
  );
}
