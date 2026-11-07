# Newsletter

A small newsletter publishing platform built with Next.js, Drizzle and Postgres.
See [PLAN.md](PLAN.md) for the roadmap.

## What it does

- **Writers** sign in with an emailed link, create a publication, write posts in Markdown
  with a live preview of the real email, send themselves a test, then send to everyone.
- **Readers** subscribe on the publication's page (`/{slug}`), confirm by email (double
  opt-in), read the archive on the web, and unsubscribe in one click.
- **Subscribers** can be searched, filtered, added by hand, imported from CSV and exported.
- **Sending** happens in batches in the background, with per-recipient status. A send that
  was interrupted can be resumed without emailing anyone twice.

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

| Script                | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Start the dev server                            |
| `npm run build`       | Production build                                |
| `npm run lint`        | ESLint                                          |
| `npm run typecheck`   | Generate route types, then TypeScript           |
| `npm run format`      | Prettier                                        |
| `npm run db:up`       | Start Postgres + Mailpit and wait until healthy |
| `npm run db:down`     | Stop the containers (data is kept in a volume)  |
| `npm run db:generate` | Create a migration from `src/db/schema.ts`      |
| `npm run db:migrate`  | Apply pending migrations                        |
| `npm run db:studio`   | Browse the database in Drizzle Studio           |

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
    api/posts/[id]/preview  Live email preview for the editor
  db/schema.ts            Drizzle schema (source of truth for migrations)
  db/auth-schema.ts       Tables Better Auth needs (user, session, account, verification)
  emails/                 React Email templates (newsletter, confirmation, sign-in)
  lib/markdown/           Markdown → syntax tree → components (shared by email and web)
  lib/email/renderers/    Pluggable email builders, keyed by posts.content_format
  lib/email/send.ts       Transport: SMTP (Mailpit) or Resend, single + batch
  lib/sending.ts          Queue, batch, resume; claims rows with FOR UPDATE SKIP LOCKED
  lib/subscribers.ts      Subscribe / confirm / unsubscribe logic
  lib/public-data.ts      Cached reads for public pages ("use cache" + cache tags)
  lib/dal.ts              Data Access Layer: session + ownership checks
  proxy.ts                Optimistic redirect for signed-out visitors
  env.ts                  Validated environment variables
drizzle/              Generated SQL migrations
```

Pages that read the session do so inside a `<Suspense>` boundary, which Cache Components
requires. Every server action re-checks the session through `src/lib/dal.ts`.

## Going to production

1. **Email:** create a [Resend](https://resend.com) account, verify your sending domain (SPF,
   DKIM and DMARC records), then set `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, and
   `EMAIL_FROM` to an address on that domain. Newsletters go out as
   `"<publication sender name>" <that address>`.
2. **Secrets and URLs:** set a fresh `BETTER_AUTH_SECRET`, `APP_URL` (https) and `DATABASE_URL`.
3. **Database:** run `npm run db:migrate` against the production database.
4. **Long sends:** sending runs in `after()` once the send request has been answered. On
   serverless hosts with short time limits, a large send can stop part-way. Use "Resume
   sending" on the post page, or move `processDeliveries` into a job queue.
5. **Bounces:** subscribers aren't marked `bounced` automatically yet. Add Resend's bounce and
   complaint webhook before the list gets large.
