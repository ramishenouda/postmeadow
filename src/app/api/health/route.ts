import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  // Always run at request time; never prerender a health check.
  await connection();

  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", db: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
