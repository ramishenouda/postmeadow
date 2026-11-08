# Postmeadow

A small newsletter publishing platform built with Next.js, Drizzle and Postgres.
See [PLAN.md](PLAN.md) for the roadmap.

## What it does

- **Writers** sign in with an emailed link, create a publication, write posts in a rich-text
  editor (toolbar, `/` menu, floating toolbar on selections, image uploads by paste or drag and
  drop, tables) with a live preview of the real email, send themselves a test, then send to everyone.
- **Branding:** a logo, an accent colour (checked for readability) and a sans or serif font,
  applied to emails and public pages.
- **Storage:** uploads live on our own server; each account has a quota from its plan, with a
  usage bar and image management in Settings.
- **Readers** subscribe on the publication's page (`/{slug}`), confirm by email (double
  opt-in), read the archive on the web, and unsubscribe in one click.
- **Subscribers** can be searched, filtered, added by hand, imported from CSV and exported.
- **Sending** happens in batches in the background, with per-recipient status. A send that
  was interrupted can be resumed without emailing anyone twice.
- **Engagement:** open rate, click rate and top links per post; a welcome email when someone
  confirms; an RSS feed and social preview images for every publication and post.
- **Plans and billing:** Free, Pro and Business with storage add-ons, paid through Stripe
  (Checkout, customer portal, webhooks). A landing page at `/` and pricing at `/pricing`.

## Requirements

- Node.js 20.9+
- Docker with Compose

## Getting started

```bash
npm install
cp .env.example .env.local   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:up                # Postgres on :5433, Mailpit on :1025/:8025
npm run db:migrate           # apply migrations
npm run dev                  # http://localhost:3000
```

- App: http://localhost:3000
- Health check: http://localhost:3000/api/health
- Dev inbox (Mailpit): http://localhost:8025. All email sent in development lands here.

To sign in locally, open http://localhost:3000/sign-in, enter any email address, then click the
link in the message that arrives in Mailpit. New accounts go to onboarding to create a publication.

## Scripts

| Script                 | What it does                                    |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Start the dev server                            |
| `npm run build`        | Production build                                |
| `npm run lint`         | ESLint                                          |
| `npm run typecheck`    | Generate route types, then TypeScript           |
| `npm run format`       | Prettier                                        |
| `npm test`             | Unit tests (Markdown round trip, editor)        |
| `npm run test:e2e`     | End-to-end tests on an isolated stack           |
| `npm run db:up`        | Start Postgres + Mailpit and wait until healthy |
| `npm run db:down`      | Stop the containers (data is kept in a volume)  |
| `npm run db:generate`  | Create a migration from `src/db/schema.ts`      |
| `npm run db:migrate`   | Apply pending migrations                        |
| `npm run db:studio`    | Browse the database in Drizzle Studio           |
| `npm run stripe:setup` | Create/update products and prices in Stripe     |

## Project layout

```
src/
  app/
    (app)/                Signed-in area: dashboard, posts, subscribers, settings, onboarding
    [slug]/               Public pages: subscribe + archive, /p/[postSlug], /subscribed
    unsubscribe/[token]/  Unsubscribe page (needs a click; link scanners can't trigger it)
    sign-in/              Magic-link sign-in
    api/auth/             Better Auth endpoints
    api/subscriptions/    Double opt-in confirmation link
    api/unsubscribe/      RFC 8058 one-click unsubscribe (List-Unsubscribe-Post)
    api/webhooks/resend/  Signed Resend webhooks (bounces, complaints)
    api/uploads/          Image upload API
    media/[...key]/       Serves uploaded files
    api/posts/[id]/preview  Live email preview for the editor
  db/schema.ts            Drizzle schema (source of truth for migrations)
  db/auth-schema.ts       Tables Better Auth needs (user, session, account, verification)
  components/editor/      Rich-text editor (Tiptap): toolbar, slash menu, bubble menu, uploads
  emails/                 React Email templates (newsletter, confirmation, sign-in)
  lib/markdown/           Markdown → syntax tree → components (shared by email and web)
  lib/email/renderers/    Pluggable email builders, keyed by posts.content_format
  lib/email/send.ts       Transport: SMTP (Mailpit) or Resend, single + batch
  lib/sending.ts          Queue, batch, resume; claims rows with FOR UPDATE SKIP LOCKED
  lib/subscribers.ts      Subscribe / confirm / unsubscribe logic
  lib/rate-limit.ts       Postgres-backed fixed-window rate limiter
  lib/plans.ts            Plans and storage limits
  lib/images/             Upload processing (sharp), quota checks, image management
  lib/storage/            Storage driver (local disk; swappable)
  lib/webhooks/resend.ts  Bounce / complaint / suppression handling
  lib/public-data.ts      Cached reads for public pages ("use cache" + cache tags)
  lib/dal.ts              Data Access Layer: session + ownership checks
  proxy.ts                Optimistic redirect for signed-out visitors
  env.ts                  Validated environment variables
drizzle/              Generated SQL migrations
tests/unit/           Unit tests (node:test)
tests/e2e/            End-to-end tests (node:test) + helpers
scripts/e2e.ts        Starts the isolated test stack and runs tests/e2e
```

Pages that read the session do so inside a `<Suspense>` boundary, which Cache Components
requires. Every server action re-checks the session through `src/lib/dal.ts`.

## The editor

Posts are written in a WYSIWYG editor built on [Tiptap](https://tiptap.dev) but **stored as
Markdown**, so the email renderer, the web archive and older posts don't depend on the editor.
Only formatting that survives that round trip is enabled (`src/components/editor/extensions.ts`).
Underline, for example, has no Markdown syntax and is left out. `npm test` checks that
Markdown written by the editor renders the same way in emails.

Type `/` for a menu of blocks (headings, lists, quote, image, divider, code, table). Selecting
text shows a small floating toolbar. Paste or drop images straight into the text to upload them.

Shortcuts: `Ctrl/⌘+B` bold, `Ctrl/⌘+I` italic, `Ctrl/⌘+K` link, `Ctrl/⌘+E` inline code,
`Ctrl/⌘+Z` undo. Typing `## `, `- `, `1. `, `> ` or ` ``` ` at the start of a line formats it.

## Uploads, storage and plans

Images are uploaded to `/api/uploads`, checked to be real PNG, JPEG, GIF or WebP files,
rotated upright, stripped of metadata (including GPS location), scaled to at most 1600px wide,
and re-encoded (WebP becomes JPEG or PNG, which Outlook can show). They're stored under
`STORAGE_DIR` on this server and served from `/media/…` with year-long caching.

Each account has a storage quota from its plan, defined in `src/lib/plans.ts`:
Free 500 MB, Pro 10 GB, Business 50 GB, plus 10 GB add-on packs for paid plans. An upload
that would go over the quota is refused with a message. Images used in a sent email, or as the
logo, can't be deleted, because those emails must keep working. Everything else can be deleted
in Settings → Storage.

## Billing

Prices live next to the limits in `src/lib/plans.ts` (Pro $9/month or $90/year, Business
$29/month or $290/year, storage add-on $3/month or $30/year). To set up Stripe:

1. Put your **test-mode** keys in `.env.local`: `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`
   from `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (Stripe CLI).
2. Run `npm run stripe:setup`. It creates the products and prices, found again later by lookup
   keys like `postmeadow_pro_month`. Run it again after changing a price: the new price takes
   over the lookup key and the old one is archived, so existing subscribers aren't moved.
3. In Stripe → Settings → Billing → Customer portal, enable cancellations, payment method
   updates and invoice history.

How it works: **webhooks are the only thing that changes a plan.** Upgrading opens Stripe
Checkout; switching plans or add-ons updates the subscription in Stripe, prorated; and the
`customer.subscription.*` webhook then writes the result to `account_billing`. Events are
verified, processed once, and ignored if older than the last one applied. A failed payment
(`past_due`) keeps the plan while Stripe retries and shows a banner. Cancelling keeps the plan
until the end of the paid period, then the account is back on Free. Going over the new quota
pauses uploads; nothing is deleted. Without Stripe keys, billing is simply switched off.

## Abuse protection

The public subscribe form is limited to **10 attempts per IP per 10 minutes**, and each
publication sends at most **300 confirmation emails per hour**
(`CONFIRMATIONS_PER_PUBLICATION_PER_HOUR`). The second limit still holds if someone rotates or
forges IP addresses. There's also a hidden honeypot field, and an address gets at most one
confirmation email every 10 minutes. Counters live in Postgres (`rate_limits`), so they're shared
across app instances. Sign-in links are rate-limited by Better Auth.

## Tests

```bash
npm test            # unit: Markdown round trip + the real editor running headless
npm run test:e2e    # end-to-end: the whole product over HTTP
```

`test:e2e` never touches your dev data. It creates a separate `newsletter_test` database, starts a
separate Mailpit and Stripe's official API fake, `stripe-mock` (`docker compose --profile test`),
builds the app and runs it on port 3100. The tests drive it like a browser: real sign-in emails,
server actions, and webhooks signed the way Resend and Stripe sign them. Use `-- --skip-build` to reuse the last build, or pass a file to run just
that one: `npm run test:e2e -- --skip-build tests/e2e/webhooks.test.ts`.

CI (`.github/workflows/ci.yml`) runs formatting, lint, typecheck, unit and end-to-end tests on
every push and pull request.

## Going to production

**The step-by-step guide is [deploy/README.md](deploy/README.md):** Docker image, Docker
Compose on a VPS (app, Postgres, Caddy for HTTPS, nightly backups), deploys from GitHub
Actions, and how to move servers. What the app itself needs in production:

1. **Email:** create a [Resend](https://resend.com) account, verify your sending domain (SPF,
   DKIM and DMARC records), then set `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, and
   `EMAIL_FROM` to an address on that domain. Newsletters go out as
   `"<publication sender name>" <that address>`.
2. **Secrets and URLs:** set a fresh `BETTER_AUTH_SECRET`, `APP_URL` (https) and `DATABASE_URL`.
3. **Database:** run `npm run db:migrate` against the production database.
4. **Long sends:** sending runs in `after()` once the send request has been answered. On
   serverless hosts with short time limits, a large send can stop part-way. Use "Resume
   sending" on the post page, or move `processDeliveries` into a job queue.
5. **Bounces, complaints, opens and clicks:** in Resend → Webhooks, add
   `{APP_URL}/api/webhooks/resend` with the `email.bounced`, `email.complained`,
   `email.suppressed`, `email.failed`, `email.opened` and `email.clicked` events, and put its
   signing secret in `RESEND_WEBHOOK_SECRET`. Turn on open and click tracking for your domain
   in Resend. Hard bounces and suppressions mark the subscriber `bounced`; spam complaints
   unsubscribe them. Both are skipped by future sends.
6. **Billing:** use live Stripe keys, run `npm run stripe:setup -- --live` once, point a Stripe
   webhook at `{APP_URL}/api/webhooks/stripe` with `checkout.session.completed` and
   `customer.subscription.*`, and enable the customer portal (see Billing above).
7. **Uploads:** mount `STORAGE_DIR` on a persistent, backed-up volume. If you run more than
   one app instance, they must share it (or add another storage driver in `src/lib/storage`).
   Putting a CDN in front of `/media/` keeps email-open bandwidth off the app server.
8. **Client IP:** set `CLIENT_IP_HEADER` to the header your host sets (Vercel: `x-real-ip`,
   Fly.io: `fly-client-ip`, Cloudflare: `cf-connecting-ip`), so the subscribe rate limit can't be
   dodged with a forged `X-Forwarded-For`.
