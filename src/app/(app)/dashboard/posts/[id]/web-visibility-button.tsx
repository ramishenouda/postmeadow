"use client";

import { useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { setWebHidden } from "../actions";

/** Take a sent post off the web, or put it back. Emails that went out don't change. */
export function WebVisibilityButton({ postId, hidden }: { postId: string; hidden: boolean }) {
  const [pending, startTransition] = useTransition();
  const toggle = () => startTransition(async () => void (await setWebHidden(postId, !hidden)));

  if (hidden) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={toggle}>
        Publish on the web again
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm" disabled={pending}>
            Remove from web
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this post from the web?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from your archive, its page, your RSS feed and search engines&apos;
            sitemap. Emails that already went out can&apos;t be recalled. You can publish it again
            any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={toggle}>Remove from web</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
