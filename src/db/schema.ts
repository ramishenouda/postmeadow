import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import type { Sponsor } from "../lib/sponsor-types";

/** A DNS record the writer adds for their sending domain. */
export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  priority?: number | null;
  status?: string | null;
};

export * from "./auth-schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ─── Publications ────────────────────────────────────────────────────────────

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    fromName: text("from_name").notNull(),
    replyTo: text("reply_to"),
    // Branding, applied to emails and the public pages.
    logoUrl: text("logo_url"),
    accentColor: text("accent_color"), // "#rrggbb"; null = default
    fontStyle: text("font_style").notNull().default("sans"), // "sans" | "serif"
    // Welcome email sent when someone confirms. Null message = the default text.
    welcomeEnabled: boolean("welcome_enabled").notNull().default(true),
    welcomeMessage: text("welcome_message"),
    // Email layout for every issue: classic | minimal | letter | magazine (src/lib/email-designs.ts)
    emailDesign: text("email_design").notNull().default("classic"),
    // Shown in every email's footer. Anti-spam laws (e.g. CAN-SPAM) require a postal
    // address in newsletters; sending is refused until it's set.
    postalAddress: text("postal_address"),
    // The publication's own web address (e.g. news.brand.com), once its DNS points here.
    customDomain: text("custom_domain").unique(),
    customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),
    // Sending from the writer's own address (e.g. hello@brand.com) once the domain's DNS
    // records are verified with the email provider.
    senderEmail: text("sender_email"),
    senderDomainId: text("sender_domain_id"),
    senderDomainStatus: text("sender_domain_status"), // "pending" | "verified" | "failed"
    senderDomainRecords: jsonb("sender_domain_records").$type<DnsRecord[]>(),
    // Paid subscriptions: readers pay the writer through Stripe Connect (src/lib/paid.ts).
    stripeAccountId: text("stripe_account_id").unique(),
    stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
    paidEnabled: boolean("paid_enabled").notNull().default(false),
    paidCurrency: text("paid_currency").notNull().default("usd"),
    paidMonthlyCents: integer("paid_monthly_cents"),
    paidYearlyCents: integer("paid_yearly_cents"),
    paidDescription: text("paid_description"),
    paidProductId: text("paid_product_id"),
    paidMonthlyPriceId: text("paid_monthly_price_id"),
    paidYearlyPriceId: text("paid_yearly_price_id"),
    // Referral program: readers share a personal link and earn rewards (referral_rewards).
    referralsEnabled: boolean("referrals_enabled").notNull().default(false),
    // The sign-up pop-up for the writer's own site (/embed/{slug}/popup.js).
    popupDelaySeconds: integer("popup_delay_seconds").notNull().default(10),
    popupHeadline: text("popup_headline"),
    // Readers can comment on web posts (comments are confirmed by email first).
    commentsEnabled: boolean("comments_enabled").notNull().default(true),
    // Paused by an admin or by the automatic spam-report check: nothing can be sent.
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    ...timestamps,
  },
  (t) => [index("publications_owner_idx").on(t.ownerId)],
);

// ─── Subscribers ─────────────────────────────────────────────────────────────

export const subscriberStatus = pgEnum("subscriber_status", [
  "pending", // signed up or invited, hasn't answered yet (expires: see src/lib/subscribers.ts)
  "active",
  "unsubscribed",
  "bounced",
  "declined", // said "no thanks" to a writer's invitation; can't be invited again
]);

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    // Always stored lowercased + trimmed.
    email: text("email").notNull(),
    status: subscriberStatus("status").notNull().default("pending"),
    confirmToken: text("confirm_token").unique(),
    // Last time a confirmation email went out; used to throttle re-sends.
    confirmSentAt: timestamp("confirm_sent_at", { withTimezone: true }),
    unsubscribeToken: text("unsubscribe_token").notNull().unique(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    // Why the status last changed when it wasn't the reader's own click, e.g. a hard bounce.
    statusReason: text("status_reason"),
    // Set when the writer invited them (rather than them signing up): the last invitation.
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    // Invitations sent to this address, capped so writers can't pester people.
    inviteCount: integer("invite_count").notNull().default(0),
    // How they got on the list: "signup" (public form), "invite" or "import".
    source: text("source").notNull().default("signup"),
    // The reader paused emails until then (from their preferences page).
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    // The post whose page they signed up on, for "posts that brought readers".
    signupPostId: uuid("signup_post_id"),
    // A paid subscription to this publication (src/lib/paid.ts), kept in sync by webhooks.
    paidStatus: text("paid_status"), // "active" | "past_due" | "canceled"
    paidUntil: timestamp("paid_until", { withTimezone: true }),
    paidInterval: text("paid_interval"), // "month" | "year"
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    // Their personal share code (?ref=…), made the first time they see it.
    referralCode: text("referral_code").unique(),
    // Who referred them; counts for that reader once they confirm.
    referredBy: uuid("referred_by").references((): AnyPgColumn => subscribers.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("subscribers_publication_email_idx").on(t.publicationId, t.email),
    index("subscribers_publication_status_idx").on(t.publicationId, t.status),
    index("subscribers_referred_by_idx").on(t.referredBy),
  ],
);

// ─── Posts ───────────────────────────────────────────────────────────────────

export const postStatus = pgEnum("post_status", [
  "draft",
  "scheduled", // waits for scheduledAt; the scheduler (src/lib/scheduler.ts) sends it
  "sending",
  "sent",
]);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    subtitle: text("subtitle"),
    // Which email builder / editor produced `content`. Only "markdown" in the
    // MVP; kept as a column so other builders (MJML, block editors, raw HTML)
    // can be added later without reshaping the table.
    contentFormat: text("content_format").notNull().default("markdown"),
    content: text("content").notNull().default(""),
    status: postStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // A sent post the writer took off the web (archive, feed, sitemap). Emails stay sent.
    webHidden: boolean("web_hidden").notNull().default(false),
    // This post's email design (src/lib/email-designs.ts). Null: the publication's.
    emailDesign: text("email_design"),
    // Where an imported post came from ("substack:123", "ghost:abc", "feed:<guid>"),
    // so importing the same export again skips it.
    importKey: text("import_key"),
    // Who wrote it (shown as the byline when the publication has a team).
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    // For paid subscribers: others get a preview (by email and on the web).
    paid: boolean("paid").notNull().default(false),
    // "issue": a normal post. "automation": an email in an automation (src/lib/automations.ts),
    // never sent as an issue or shown on the web; it stays a draft and can be edited any time.
    kind: text("kind").notNull().default("issue"),
    // Who gets it: "everyone" (active subscribers) or "tags" (active subscribers with
    // any of the tags in post_audience_tags; none left means nobody, never everyone).
    audience: text("audience").notNull().default("everyone"),
    // Why the last send attempt was refused (e.g. a scheduled post over the plan limit).
    sendError: text("send_error"),
    // A/B subject test: when abMetric is set, a sample gets the title (A) or subjectB
    // (B); after abWaitHours the better one by abMetric goes to everyone else.
    subjectB: text("subject_b"),
    abMetric: text("ab_metric"), // "opens" | "clicks" | null (no test)
    abTestPercent: integer("ab_test_percent").notNull().default(20),
    abWaitHours: integer("ab_wait_hours").notNull().default(4),
    abDecideAt: timestamp("ab_decide_at", { withTimezone: true }),
    abWinner: text("ab_winner"), // "a" | "b"
    // A resend of another post to the people who didn't open it. Never on the web.
    resendOf: uuid("resend_of").references((): AnyPgColumn => posts.id, { onDelete: "cascade" }),
    // A paid placement shown at the top or bottom of the issue (src/lib/sponsor.ts).
    sponsor: jsonb("sponsor").$type<Sponsor>(),
    // Secret link to the sponsor's results page.
    sponsorReportToken: text("sponsor_report_token").unique(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("posts_publication_slug_idx").on(t.publicationId, t.slug),
    uniqueIndex("posts_import_key_idx").on(t.publicationId, t.importKey),
    index("posts_scheduled_idx").on(t.status, t.scheduledAt),
  ],
);

// ─── Deliveries (one row per post × subscriber) ──────────────────────────────

export const deliveryStatus = pgEnum("delivery_status", [
  "queued",
  "sending", // claimed by a worker; guards against double sends
  "sent",
  "failed",
  "bounced", // reported by the provider after sending
  "complained", // the recipient marked it as spam
  "held", // waiting for an A/B test's winner
]);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    status: deliveryStatus("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Engagement, from the provider's open/click events. Opens are approximate
    // (Apple Mail Privacy Protection pre-loads images), clicks are reliable.
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    opens: integer("opens").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    // A/B subject tests: "a" or "b". Null when the post had no test.
    variant: text("variant"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("deliveries_post_subscriber_idx").on(t.postId, t.subscriberId),
    index("deliveries_post_status_idx").on(t.postId, t.status),
  ],
);

// ─── Provider webhooks (idempotency) ──────────────────────────────────────────

/** Every processed webhook delivery, so retries of the same event are ignored. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // the provider's message id (svix-id / webhook-id)
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Rate limiting ───────────────────────────────────────────────────────────

/** Fixed-window counters, shared by every app instance through the database. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

// ─── Plans and storage ───────────────────────────────────────────────────────

/**
 * One row per account that isn't on the default free plan, or that has add-ons.
 * Plan limits live in code (src/lib/plans.ts); Stripe ids will be added here.
 */
export const accountBilling = pgTable("account_billing", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"),
  storageAddons: integer("storage_addons").notNull().default(0),
  // Stripe state, written only from verified webhooks (the source of truth).
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingInterval: text("billing_interval"), // "month" | "year"
  subscriptionStatus: text("subscription_status"), // Stripe's status, e.g. "active", "past_due"
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // `created` of the last applied Stripe event; older events arriving late are ignored.
  stripeEventAt: timestamp("stripe_event_at", { withTimezone: true }),
  ...timestamps,
});

/** Uploaded images. Files live in storage under `key`; `bytes` counts toward the owner's quota. */
export const images = pgTable(
  "images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    originalName: text("original_name"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("images_owner_idx").on(t.ownerId)],
);

/** Clicks per link per recipient, for "top links" on a sent post. */
export const deliveryLinkClicks = pgTable(
  "delivery_link_clicks",
  {
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    clicks: integer("clicks").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.deliveryId, t.url] })],
);

/** A writer's saved post templates ("Save as template" in the editor). */
export const postTemplates = pgTable(
  "post_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    subtitle: text("subtitle"),
    contentFormat: text("content_format").notNull().default("markdown"),
    content: text("content").notNull().default(""),
    // The design of the post it was saved from, if that post had its own.
    emailDesign: text("email_design"),
    ...timestamps,
  },
  (t) => [index("post_templates_publication_idx").on(t.publicationId)],
);

// ─── Tags and segments ───────────────────────────────────────────────────────

/** Labels for subscribers, per publication. Posts can be sent to subscribers with tags. */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // A topic readers can pick themselves (sign-up form, preferences page).
    public: boolean("public").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("tags_publication_name_idx").on(t.publicationId, sql`lower(${t.name})`)],
);

export const subscriberTags = pgTable(
  "subscriber_tags",
  {
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.subscriberId, t.tagId] }),
    index("subscriber_tags_tag_idx").on(t.tagId),
  ],
);

/** The tags a post is sent to (when posts.audience = "tags"). */
export const postAudienceTags = pgTable(
  "post_audience_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
);

// ─── Usage ───────────────────────────────────────────────────────────────────

/**
 * Newsletter emails queued per account per calendar month (UTC), for the plan's
 * monthly limit. A counter rather than a count of deliveries, so deleting
 * subscribers doesn't give sends back.
 */
export const emailUsage = pgTable(
  "email_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // "2026-11"
    emails: integer("emails").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);

// ─── Reader engagement on the web ────────────────────────────────────────────

/** One like per post per browser (a random visitor id in a cookie). */
export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    visitor: text("visitor").notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.postId, t.visitor] })],
);

/**
 * Comments on web posts. A new commenter confirms by email first ("pending" until
 * then); after that their browser is remembered (commenters.token in a cookie).
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"), // "pending" | "published"
    confirmToken: text("confirm_token").unique(),
    // Written by the publication's owner, shown with an "Author" badge.
    byAuthor: boolean("by_author").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("comments_post_idx").on(t.postId, t.status)],
);

/** People who confirmed a comment once, per publication; their browser keeps `token`. */
export const commenters = pgTable(
  "commenters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex("commenters_publication_email_idx").on(t.publicationId, t.email)],
);

// ─── Growth ──────────────────────────────────────────────────────────────────

/** "Refer 3 friends, get the sticker pack": rewards at referral counts. */
export const referralRewards = pgTable(
  "referral_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    threshold: integer("threshold").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex("referral_rewards_threshold_idx").on(t.publicationId, t.threshold)],
);

/** Rewards a reader has reached (the writer was told, and so was the reader). */
export const referralGrants = pgTable(
  "referral_grants",
  {
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => referralRewards.id, { onDelete: "cascade" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.subscriberId, t.rewardId] })],
);

/** Publications a writer recommends; offered to new readers right after they confirm. */
export const recommendations = pgTable(
  "recommendations",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    recommendedId: uuid("recommended_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.recommendedId] }),
    index("recommendations_recommended_idx").on(t.recommendedId),
  ],
);

/** Focused sign-up pages for campaigns: /{publication}/l/{slug}, optionally tagging sign-ups. */
export const landingPages = pgTable(
  "landing_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    headline: text("headline").notNull(),
    // Short Markdown: what readers get.
    body: text("body").notNull().default(""),
    buttonText: text("button_text"),
    tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("landing_pages_publication_slug_idx").on(t.publicationId, t.slug)],
);

// ─── Automations ─────────────────────────────────────────────────────────────

/**
 * A series of emails sent automatically: a welcome series when someone subscribes,
 * or a sequence when a subscriber gets a tag. Each step's email is a post of kind
 * "automation", so it's written in the normal editor and tracked like any issue.
 */
export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: text("trigger").notNull(), // "subscribed" | "tag_added"
    triggerTagId: uuid("trigger_tag_id").references(() => tags.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("automations_publication_idx").on(t.publicationId)],
);

export const automationSteps = pgTable(
  "automation_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    // Wait this long after the previous step (or the trigger, for the first).
    delayHours: integer("delay_hours").notNull().default(0),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("automation_steps_automation_idx").on(t.automationId, t.position)],
);

/** One subscriber going through one automation (once per subscriber per automation). */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    // Index into the automation's steps (by position) of the next email.
    nextStep: integer("next_step").notNull().default(0),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"), // "active" | "done" | "stopped"
    ...timestamps,
  },
  (t) => [
    uniqueIndex("automation_runs_unique_idx").on(t.automationId, t.subscriberId),
    index("automation_runs_due_idx").on(t.status, t.nextAt),
  ],
);

// ─── Teams ───────────────────────────────────────────────────────────────────

/**
 * People who work on a publication besides its owner. "editor": everything except
 * billing and the team; "contributor": writes drafts, an editor sends them.
 */
export const publicationMembers = pgTable(
  "publication_members",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "editor" | "contributor"
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.userId] }),
    // One team per account (the dashboard shows one publication).
    uniqueIndex("publication_members_user_idx").on(t.userId),
  ],
);

export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex("team_invites_publication_email_idx").on(t.publicationId, t.email)],
);
