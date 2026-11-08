"use client";

import type { Editor } from "@tiptap/react";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, uploadImage } from "./upload";

/** Insert an image by uploading a file or pasting an address. Controlled, so "/image" can open it. */
export function ImageDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so every opening starts fresh. */}
        {open ? <ImageForm editor={editor} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ImageForm({ editor, onDone }: { editor: Editor | null; onDone: () => void }) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const validSrc = /^https?:\/\/\S+$/i.test(src.trim());

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const image = await uploadImage(file);
      setSrc(image.url);
      if (!alt) setAlt(file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const insert = () => {
    if (!validSrc) {
      setError(
        mode === "upload" ? "Choose an image first." : "Enter an address that starts with https://",
      );
      return;
    }
    editor?.chain().focus().setImage({ src: src.trim(), alt: alt.trim() }).run();
    onDone();
  };

  return (
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
          Uploaded images are stored with your account and count toward your storage.
        </DialogDescription>
      </DialogHeader>

      <div className="bg-muted flex gap-1 rounded-lg p-1 text-sm" role="tablist">
        {(
          [
            ["upload", "Upload"],
            ["link", "From a link"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5",
              mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm",
            dragging && "border-ring bg-muted/50",
          )}
        >
          {validSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- just-uploaded image
            <img src={src} alt="" className="max-h-40 rounded-md object-contain" />
          ) : (
            <Upload className="text-muted-foreground size-6" aria-hidden />
          )}
          <p className="text-muted-foreground">
            {uploading
              ? "Uploading…"
              : validSrc
                ? "Uploaded. Choose another to replace it."
                : "Drop an image here, or"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            Choose file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <p className="text-muted-foreground text-xs">PNG, JPEG, GIF or WebP, up to 10 MB</p>
        </div>
      ) : (
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
          {validSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied external URL
            <img src={src.trim()} alt="" className="max-h-40 rounded-md border object-contain" />
          ) : null}
        </div>
      )}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="image-alt">Description</Label>
        <Input
          id="image-alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="What the image shows (for screen readers, and when images are off)"
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={uploading || !validSrc}>
          Insert
        </Button>
      </DialogFooter>
    </form>
  );
}
