# Newsletter platform: build plan

A small publishing platform: writers create a publication, write posts, and
email them to confirmed subscribers. Readers subscribe, confirm, read the web
archive and unsubscribe in one click.

## Stack

| Layer          | Choice                                         |
| -------------- | ---------------------------------------------- |
| Framework      | Next.js 16 (App Router, Cache Components) + TS |
| Styling        | Tailwind CSS v4 (+ shadcn/ui from Phase 1)     |
| Database       | Postgres 17 (Docker, port 5433) + Drizzle ORM  |
| Auth           | Better Auth, magic link                        |
| Email building | React Email                                    |
| Email sending  | Mailpit (dev, SMTP) / Resend (prod)            |
| Editor         | Markdown with live preview                     |
| Validation     | Zod                                            |

## Data model

- `publications`: owner, name, slug, sender name, reply-to
- `subscribers`: per publication; `pending → active → unsubscribed|bounced`,
  with confirm and unsubscribe tokens
- `posts`: `content_format` (only `markdown` for now) + `content`,
  `draft → sending → sent`
- `deliveries`: one row per post × subscriber, so sending can resume and report
  results

## Phases

- [x] **Phase 0: Setup**: scaffold, Docker (Postgres + Mailpit), env validation,
      Drizzle schema + first migration, `/api/health`
- [x] **Phase 1: Auth and publication**: magic-link sign-in, onboarding to
      create a publication, `publications.owner_id` FK, dashboard with stats
- [x] **Phase 2: Subscribers**: public subscribe page, double opt-in, one-click
      unsubscribe (`List-Unsubscribe`), admin list with search/filter, manual add,
      CSV import and export
- [x] **Phase 3: Posts**: Markdown editor with autosave and live email preview,
      drafts, web archive and post pages
- [x] **Phase 4: Sending**: send test, batched send to active subscribers,
      per-recipient delivery status, resumable and safe against double sends
- [x] **Phase 5: Polish**: dashboard overview with getting-started steps,
      settings page, empty states, error and not-found pages

## Email building

The MVP uses React Email only. Markdown is parsed with remark and each node is
mapped to a React Email component (`<Heading>`, `<Text>`, `<Link>`, `<Img>`, …),
which keeps styles inline. The result is wrapped in `NewsletterEmail`
(header, "view in browser", unsubscribe footer) and rendered to HTML and plain text.

**Design hook for later:** rendering sits behind an `EmailRenderer` interface
(`src/lib/email/renderers/`), chosen by `posts.content_format`. The sending
pipeline only ever sees the finished HTML and text.

## After the MVP

- **Choice of email builders**: let users pick between builders, e.g. MJML,
  Maizzle, a drag-and-drop/block editor (Unlayer, GrapesJS) or raw HTML. This is
  supported by the `EmailRenderer` interface and `content_format` column.
- Scheduled sends, and a real job queue for very large lists (sending currently
  runs in `after()` inside the web process)
- Rate limiting on the public subscribe form by IP (today: honeypot + per-address
  cooldown)
- Open and click tracking, bounce and complaint webhooks
- Paid subscriptions (Stripe)
- Multiple authors per publication, custom domains, RSS
