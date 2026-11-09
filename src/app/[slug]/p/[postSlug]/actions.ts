"use server";

import { cookies, headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import {
  commenterCookie,
  createComment,
  findWebPost,
  toggleLike,
  VISITOR_COOKIE,
  type CommentResult,
} from "@/lib/comments";
import { randomToken } from "@/lib/tokens";
import { refresh } from "next/cache";

export async function like(slug: string, postSlug: string) {
  const post = await findWebPost(slug, postSlug);
  if (!post) return null;
  const jar = await cookies();
  let visitor = jar.get(VISITOR_COOKIE)?.value;
  if (!visitor || !/^[\w-]{16,64}$/.test(visitor)) {
    visitor = randomToken();
    jar.set(VISITOR_COOKIE, visitor, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return toggleLike(post.id, visitor, clientIp(await headers()));
}

export type CommentFormState = { status: "idle" } | CommentResult;

export async function comment(
  slug: string,
  postSlug: string,
  _prev: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  // Honeypot: real people never fill it in.
  if (String(formData.get("website") ?? "") !== "") return { status: "published" };
  const post = await findWebPost(slug, postSlug);
  if (!post) return { status: "error", message: "This post isn't available any more." };
  const jar = await cookies();
  const result = await createComment({
    post,
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    body: String(formData.get("body") ?? ""),
    commenterToken: jar.get(commenterCookie(post.publicationSlug))?.value,
    ip: clientIp(await headers()),
  });
  if (result.status === "published") refresh();
  return result;
}
