# Postmeadow: build plan

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
| Editor         | Tiptap rich text, stored as Markdown           |
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

## Since the MVP

- [x] **Rich-text editor**: Tiptap WYSIWYG with toolbar, link popover, image dialog,
      tables and shortcuts. Posts are still stored as Markdown.
- [x] **Bounces and complaints**: signed Resend webhook; hard bounces and suppressions
      mark subscribers bounced, spam complaints unsubscribe them.
- [x] **Rate limiting**: per-IP and per-publication limits on the subscribe form.
- [x] **Tests in the repo + CI**: unit and end-to-end suites (`npm test`,
      `npm run test:e2e`) and a GitHub Actions workflow.
- [x] **Writing experience**: image uploads (paste, drop, dialog) to our own storage,
      `/` menu, floating selection toolbar.
- [x] **Storage quotas**: per-account limits from plans (Free 500 MB / Pro 10 GB /
      Business 50 GB, 10 GB add-ons), usage bar, image management.
- [x] **Branding**: logo, accent colour (contrast-checked), sans/serif, in emails and
      public pages.
- [x] **Billing**: Stripe Checkout for plans and storage add-ons, customer portal,
      webhook-driven plan sync, `npm run stripe:setup`, billing page.
- [x] **Landing and pricing pages** (`/`, `/pricing`).
- [x] **Growth**: open/click stats with top links, welcome email, RSS feed, social
      preview images.
- [x] **Deployment setup**: Docker image, Compose stack (app, Postgres, Caddy,
      nightly backups), GitHub Actions deploy, guide in `deploy/README.md`. Target:
      Hostinger KVM 2 (Frankfurt) now, Hetzner later.
- [ ] **Going live**: follow `deploy/README.md` on the server; Resend and Stripe in
      live mode; off-server backup copies; error monitoring.
- [ ] **Before launch**: Free-plan sending limits (email cost scales with subscribers).
- [x] **Email templates**: four email designs (Classic, Minimal, Letter, Magazine),
      five starter post templates, and saved templates per publication.
- [x] **What every competitor has**: scheduled sends (with an in-process scheduler
      that also resumes interrupted sends), embeddable signup forms, SEO basics
      (sitemap, robots, canonical), editing/unpublishing sent posts, growth chart.
- [ ] **Next competitive features**: custom domains per publication, importing posts
      from Substack/beehiiv/Ghost, tags and segments, paid newsletters (Stripe Connect).

## After the MVP

- **Choice of email builders**: let users pick between builders, e.g. MJML,
  Maizzle, a drag-and-drop/block editor (Unlayer, GrapesJS) or raw HTML. This is
  supported by the `EmailRenderer` interface and `content_format` column.
- Scheduled sends, and a real job queue for very large lists (sending currently
  runs in `after()` inside the web process)
- Open and click tracking, bounce and complaint webhooks
- Paid subscriptions for readers (Stripe)
- Multiple authors per publication, custom domains, RSS
