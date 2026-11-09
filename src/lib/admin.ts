import "server-only";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { getSession } from "@/lib/dal";
import { usageMonth } from "@/lib/limits";
import { adminEmails } from "@/lib/notify";
import { REPUTATION, reputationProblem } from "@/lib/reputation";

/** The signed-in admin (ADMIN_EMAILS). Everyone else gets a plain 404. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session || !adminEmails().includes(session.user.email.toLowerCase())) notFound();
  return session.user;
}

export type AdminRow = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  plan: string;
  createdAt: Date;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  active: number;
  added7: number;
  imported7: number;
  emailsMonth: number;
  delivered30: number;
  bounced30: number;
  complained30: number;
  /** Things worth a look, most serious first. */
  flags: string[];
};

/** Big imports and fast-growing new accounts are where spam usually starts. */
const WATCH = { importedPerWeek: 500, newAccountDays: 7, newAccountSubscribers: 500 };

/** Every publication with the numbers that matter for abuse, flagged ones first. */
export async function adminOverview(q: string): Promise<AdminRow[]> {
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    owner_email: string;
    plan: string;
    created_at: Date;
    suspended_at: Date | null;
    suspended_reason: string | null;
    active: number;
    added7: number;
    imported7: number;
    emails_month: number;
    delivered30: number;
    bounced30: number;
    complained30: number;
  }>(sql`
    select p.id, p.name, p.slug, u.email as owner_email, coalesce(b.plan, 'free') as plan,
      p.created_at, p.suspended_at, p.suspended_reason,
      s.active, s.added7, s.imported7,
      coalesce(e.emails, 0)::int as emails_month,
      d.delivered30, d.bounced30, d.complained30
    from publications p
    join "user" u on u.id = p.owner_id
    left join account_billing b on b.user_id = p.owner_id
    left join email_usage e on e.user_id = p.owner_id and e.month = ${usageMonth()}
    cross join lateral (
      select
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where created_at > now() - interval '7 days')::int as added7,
        count(*) filter (where source = 'import' and created_at > now() - interval '7 days')::int as imported7
      from subscribers where publication_id = p.id
    ) s
    cross join lateral (
      select
        count(*)::int as delivered30,
        count(*) filter (where dl.status = 'bounced')::int as bounced30,
        count(*) filter (where dl.status = 'complained')::int as complained30
      from deliveries dl join posts po on po.id = dl.post_id
      where po.publication_id = p.id
        and dl.sent_at > now() - make_interval(days => ${REPUTATION.windowDays})
    ) d
    where ${q} = '' or p.name ilike ${like} or p.slug ilike ${like} or u.email ilike ${like}
    order by p.created_at desc
    limit 200
  `);

  return rows
    .map((r) => {
      const flags: string[] = [];
      const problem = reputationProblem({
        delivered: r.delivered30,
        bounced: r.bounced30,
        complained: r.complained30,
      });
      if (r.suspended_at) flags.push("Paused");
      if (problem) flags.push(problem);
      if (r.complained30 > 0 && !problem) flags.push(`${r.complained30} spam reports (30 days)`);
      if (r.imported7 >= WATCH.importedPerWeek) {
        flags.push(`Imported ${r.imported7.toLocaleString("en")} addresses this week`);
      }
      const ageDays = (Date.now() - new Date(r.created_at).getTime()) / 864e5;
      if (ageDays < WATCH.newAccountDays && r.active >= WATCH.newAccountSubscribers) {
        flags.push("New account with a big list");
      }
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        ownerEmail: r.owner_email,
        plan: r.plan,
        createdAt: new Date(r.created_at),
        suspendedAt: r.suspended_at ? new Date(r.suspended_at) : null,
        suspendedReason: r.suspended_reason,
        active: r.active,
        added7: r.added7,
        imported7: r.imported7,
        emailsMonth: r.emails_month,
        delivered30: r.delivered30,
        bounced30: r.bounced30,
        complained30: r.complained30,
        flags,
      };
    })
    .sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0));
}
