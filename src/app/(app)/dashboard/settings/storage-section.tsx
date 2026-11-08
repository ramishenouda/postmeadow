"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { deleteUploadedImage } from "./actions";

type Image = {
  id: string;
  url: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string | null;
  inUse: boolean;
};

export function StorageSection({
  usage,
  images,
}: {
  usage: { planName: string; used: number; limit: number };
  images: Image[];
}) {
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>
          {usage.planName} plan · {formatBytes(usage.used)} of {formatBytes(usage.limit)} used
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="bg-muted h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Storage used"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full transition-all",
              percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-amber-500" : "bg-foreground",
            )}
            style={{ width: `${Math.max(percent, usage.used > 0 ? 1 : 0)}%` }}
          />
        </div>
        {percent >= 90 ? (
          <p className="text-destructive text-sm">
            You&apos;re almost out of storage. Delete images you no longer need, or{" "}
            <Link href="/dashboard/billing" className="underline underline-offset-2">
              get more storage
            </Link>
            .
          </p>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {images.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No uploads yet. Images you add to posts, and your logo, appear here.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image) => (
              <ImageTile key={image.id} image={image} onError={setError} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ImageTile({ image, onError }: { image: Image; onError: (e: string | null) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex aspect-video items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own uploads */}
        <img
          src={image.url}
          alt={image.originalName ?? ""}
          loading="lazy"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="space-y-1 p-2 text-xs">
        <p className="truncate font-medium" title={image.originalName ?? undefined}>
          {image.originalName ?? "Image"}
        </p>
        <p className="text-muted-foreground">
          {formatBytes(image.bytes)} · {image.width}×{image.height}
        </p>
        {image.inUse ? (
          <p className="text-muted-foreground" title="Used in a sent email or as your logo">
            In use, can&apos;t be deleted
          </p>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            className="text-destructive -ml-2"
            onClick={() =>
              startTransition(async () => {
                onError(null);
                const result = await deleteUploadedImage(image.id);
                if (!result.ok) onError(result.error);
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        )}
      </div>
    </li>
  );
}
