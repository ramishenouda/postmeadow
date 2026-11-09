import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { landingPages, tags } from "@/db/schema";
import { env } from "@/env";
import { requirePublication } from "@/lib/dal";
import { listRecommendations, recommendedBy } from "@/lib/recommendations";
import { leaderboard, listRewards } from "@/lib/referrals";
import {
  LandingPageEditor,
  PopupForm,
  RecommendationForm,
  ReferralToggle,
  RemoveButton,
  RewardForm,
} from "./growth-forms";
import { Snippet } from "../settings/embed-snippets";

export const metadata: Metadata = { title: "Grow" };

export default function GrowthPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Grow</h1>
        <p className="text-muted-foreground text-sm">
          Let readers bring friends, team up with other writers, and turn visitors into readers.
        </p>
      </div>
      <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-xl" />}>
        <Growth />
      </Suspense>
    </div>
  );
}

async function Growth() {
  const { publication } = await requirePublication("editor");
  const origin = new URL(env.APP_URL).origin;
  const [rewards, leaders, recommended, fans, pages] = await Promise.all([
    listRewards(publication.id),
    leaderboard(publication.id),
    listRecommendations(publication.id),
    recommendedBy(publication.id),
    db
      .select({
        id: landingPages.id,
        slug: landingPages.slug,
        headline: landingPages.headline,
        body: landingPages.body,
        buttonText: landingPages.buttonText,
        tag: tags.name,
      })
      .from(landingPages)
      .leftJoin(tags, eq(tags.id, landingPages.tagId))
      .where(eq(landingPages.publicationId, publication.id))
      .orderBy(asc(landingPages.createdAt)),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Referral program</CardTitle>
          <CardDescription>
            Every reader gets a personal link (in your emails&apos; footer and on their preferences
            page). Friends who subscribe through it and confirm count for them. When they reach a
            reward, you both get an email; you send the reward yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ReferralToggle enabled={publication.referralsEnabled} />
          {publication.referralsEnabled ? (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Rewards</h3>
                {rewards.length ? (
                  <ul className="divide-y rounded-lg border text-sm">
                    {rewards.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span>
                          <span className="font-medium tabular-nums">{r.threshold}</span>{" "}
                          {r.threshold === 1 ? "referral" : "referrals"} → {r.name}
                          {r.description ? (
                            <span className="text-muted-foreground block text-xs">
                              {r.description}
                            </span>
                          ) : null}
                        </span>
                        <RemoveButton kind="reward" id={r.id} label={`Remove ${r.name}`} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No rewards yet. Readers can still share; rewards give them a reason to.
                  </p>
                )}
                <RewardForm />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Top referrers</h3>
                {leaders.length ? (
                  <ol className="divide-y rounded-lg border text-sm">
                    {leaders.map((l, i) => (
                      <li key={l.email} className="flex justify-between px-3 py-2">
                        <span>
                          <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
                          {l.email}
                        </span>
                        <span className="tabular-nums">{l.referred}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted-foreground text-sm">Nobody has referred a reader yet.</p>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>
            Recommend other newsletters on Postmeadow. Your new readers see them right after they
            confirm and can subscribe in one click. Writers often recommend each other.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recommended.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {recommended.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <Link href={`/${r.slug}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    {r.note ? (
                      <span className="text-muted-foreground block truncate text-xs">
                        “{r.note}”
                      </span>
                    ) : null}
                  </span>
                  <RemoveButton
                    kind="recommendation"
                    id={r.id}
                    label={`Stop recommending ${r.name}`}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <RecommendationForm origin={origin} />
          {fans.length ? (
            <p className="text-muted-foreground text-sm">
              Recommending you:{" "}
              {fans.map((f, i) => (
                <span key={f.slug}>
                  {i ? ", " : ""}
                  <Link href={`/${f.slug}`} className="text-foreground hover:underline">
                    {f.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Landing pages</CardTitle>
          <CardDescription>
            Focused sign-up pages for a campaign, a talk or an ad: one headline, a few lines and the
            form. Sign-ups can get a tag, so you know where they came from and can write to them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pages.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {pages.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{p.headline}</span>
                    <a
                      href={`/${publication.slug}/l/${p.slug}`}
                      target="_blank"
                      className="text-muted-foreground text-xs hover:underline"
                    >
                      {new URL(env.APP_URL).host}/{publication.slug}/l/{p.slug}
                    </a>
                    {p.tag ? (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · tags sign-ups “{p.tag}”
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <LandingPageEditor
                      prefix={`${new URL(env.APP_URL).host}/${publication.slug}/l/`}
                      page={{ ...p, tag: p.tag ?? "", buttonText: p.buttonText ?? "" }}
                    />
                    <RemoveButton kind="landing" id={p.id} label={`Delete ${p.headline}`} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <LandingPageEditor prefix={`${new URL(env.APP_URL).host}/${publication.slug}/l/`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pop-up for your website</CardTitle>
          <CardDescription>
            Add one line to your site and visitors are invited to subscribe after a few seconds. It
            shows once; if they close it, it stays away for 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PopupForm
            delay={publication.popupDelaySeconds}
            headline={publication.popupHeadline ?? ""}
          />
          <Snippet
            label="Add before </body>"
            hint="Works on any site where you can add HTML (WordPress, Squarespace, Webflow, Shopify…)."
            code={`<script src="${origin}/embed/${publication.slug}/popup.js" async></script>`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
