"use server";

import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/subscribers";

export async function unsubscribe(token: string) {
  await unsubscribeByToken(token);
  redirect(`/unsubscribe/${token}`);
}
