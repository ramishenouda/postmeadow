"use client";

import type { Editor } from "@tiptap/react";
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Turns "example.com" into "https://example.com"; rejects anything but http(s)/mailto. */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // javascript:, data:, …
  return `https://${value}`;
}

export function LinkPopover({
  editor,
  open,
  onOpenChange,
  trigger,
}: {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80">
        {/* Mounted only while open, so it starts from the current link each time. */}
        {editor ? <LinkForm editor={editor} onDone={() => onOpenChange(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const existing = editor.getAttributes("link").href as string | undefined;
  const [url, setUrl] = useState(existing ?? "");
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const href = normalizeUrl(url);
    if (!href) {
      setError("Enter a web address (https://…) or an email address.");
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      // Nothing selected: insert the address itself as the link text.
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url.trim(),
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    onDone();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onDone();
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label htmlFor="link-url" className="text-xs font-medium">
        Link to
      </label>
      <Input
        id="link-url"
        autoFocus
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        placeholder="https://example.com"
        aria-invalid={Boolean(error)}
        className="h-8"
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div className="flex justify-between gap-2">
        {existing ? (
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            Remove link
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm">
          {existing ? "Update" : "Add link"}
        </Button>
      </div>
    </form>
  );
}
