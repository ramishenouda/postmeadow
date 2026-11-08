"use client";

import type { Editor } from "@tiptap/react";
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ImageDialog({ editor, trigger }: { editor: Editor | null; trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const insert = () => {
    const url = src.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError("Enter an image address that starts with https://");
      return;
    }
    editor?.chain().focus().setImage({ src: url, alt: alt.trim() }).run();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setSrc("");
          setAlt("");
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            insert();
          }}
        >
          <DialogHeader>
            <DialogTitle>Insert image</DialogTitle>
            <DialogDescription>
              Paste the address of an image that&apos;s already online. Email clients load it from
              there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="image-src">Image address</Label>
            <Input
              id="image-src"
              autoFocus
              value={src}
              onChange={(e) => {
                setSrc(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com/photo.jpg"
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="image-alt">Description</Label>
            <Input
              id="image-alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="What the image shows (for screen readers, and when images are off)"
            />
          </div>
          {/^https?:\/\/\S+$/i.test(src.trim()) ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied external URL
            <img src={src.trim()} alt="" className="max-h-40 rounded-md border object-contain" />
          ) : null}
          <DialogFooter>
            <Button type="submit">Insert</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
