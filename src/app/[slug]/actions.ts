"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { handleSubscribeRequest } from "@/lib/subscribe-request";

export type SubscribeState =
  | { status: "idle" }
  | { status: "success"; email: string }
  | { status: "error"; message: string; email?: string };

export async function subscribe(
  slug: string,
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const result = await handleSubscribeRequest({
    slug,
    email: String(formData.get("email") ?? ""),
    honeypot: String(formData.get("website") ?? ""),
    ip: clientIp(await headers()),
  });
  if (result.status === "success") return result;
  return { status: "error", message: result.message, email: result.email };
}
