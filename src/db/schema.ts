import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

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
    ...timestamps,
  },
  (t) => [index("publications_owner_idx").on(t.ownerId)],
);

// ─── Subscribers ─────────────────────────────────────────────────────────────

export const subscriberStatus = pgEnum("subscriber_status", [
  "pending", // signed up, hasn't clicked the confirmation link yet
  "active",
  "unsubscribed",
  "bounced",
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
    ...timestamps,
  },
  (t) => [
    uniqueIndex("subscribers_publication_email_idx").on(t.publicationId, t.email),
    index("subscribers_publication_status_idx").on(t.publicationId, t.status),
  ],
);

// ─── Posts ───────────────────────────────────────────────────────────────────

export const postStatus = pgEnum("post_status", ["draft", "sending", "sent"]);

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
    ...timestamps,
  },
  (t) => [uniqueIndex("posts_publication_slug_idx").on(t.publicationId, t.slug)],
);

// ─── Deliveries (one row per post × subscriber) ──────────────────────────────

export const deliveryStatus = pgEnum("delivery_status", [
  "queued",
  "sending", // claimed by a worker; guards against double sends
  "sent",
  "failed",
  "bounced", // reported by the provider after sending
  "complained", // the recipient marked it as spam
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
