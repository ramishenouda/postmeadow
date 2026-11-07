import { asc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { getPublicationForUser, getSession } from "@/lib/dal";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const publication = await getPublicationForUser(session.user.id);
  if (!publication) return new Response("Not found", { status: 404 });

  const rows = await db
    .select({
      email: subscribers.email,
      status: subscribers.status,
      created_at: subscribers.createdAt,
      confirmed_at: subscribers.confirmedAt,
      unsubscribed_at: subscribers.unsubscribedAt,
    })
    .from(subscribers)
    .where(eq(subscribers.publicationId, publication.id))
    .orderBy(asc(subscribers.createdAt));

  const csv = Papa.unparse(
    rows.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      confirmed_at: r.confirmed_at?.toISOString() ?? "",
      unsubscribed_at: r.unsubscribed_at?.toISOString() ?? "",
    })),
    // Neutralise spreadsheet formula injection (cells starting with = + - @).
    { escapeFormulae: true },
  );

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${publication.slug}-subscribers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
