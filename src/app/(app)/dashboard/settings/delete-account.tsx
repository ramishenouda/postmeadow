"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMyAccount } from "./actions";

/** Settings → Delete account. Confirmed by typing the publication's web address. */
export function DeleteAccount({ slug }: { slug: string }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Deletes your publication, posts, subscribers, templates and images for good, and cancels
          any paid plan. Export your subscribers first if you want to keep them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          onOpenChange={() => {
            setTyped("");
            setError(null);
          }}
        >
          <AlertDialogTrigger render={<Button variant="destructive">Delete account…</Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. Your public page stops working, and images in emails
                you&apos;ve sent will no longer load.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const result = await deleteMyAccount(typed);
                  // Only returns on failure; success redirects.
                  if (result && !result.ok) setError(result.error);
                });
              }}
            >
              <Label htmlFor="confirm-delete">
                Type <strong>{slug}</strong> to confirm
              </Label>
              <Input
                id="confirm-delete"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                aria-invalid={Boolean(error)}
              />
              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}
              <AlertDialogFooter className="pt-2">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={pending || typed.trim().toLowerCase() !== slug}
                >
                  {pending ? "Deleting…" : "Delete everything"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
