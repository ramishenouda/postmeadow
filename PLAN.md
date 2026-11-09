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
      live mode; fill in `src/lib/legal.ts` and have the legal pages reviewed; set
      `ADMIN_EMAILS`, `SENTRY_DSN` and the `BACKUP_S3_*` settings.
- [x] **Launch readiness**: plan limits (Free 1,000 subscribers / 10,000 emails a month,
      Pro 10,000 / 100,000, Business 50,000 / 500,000; sending pauses, sign-ups don't),
      postal address in every footer (required to send), terms and privacy pages,
      account deletion, admin page with pause switch and automatic pausing on high
      spam-report or bounce rates, Sentry, encrypted off-site backups (S3-compatible).
- [x] **Tags and segments**: tag subscribers (one by one, everyone a filter shows, on
      import, or from sign-up forms with existing tags); send a post to everyone or to
      subscribers with any of chosen tags.
- [x] **Email templates**: four email designs (Classic, Minimal, Letter, Magazine),
      five starter post templates, and saved templates per publication.
- [x] **Colourful newsletters**: Boutique, Launch and Arcade designs (cover photos, dark
      and neon themes); buttons (a link on its own line) and image rows with captions and
      prices; starter templates for shops, tech and games with real photos
      (`public/templates`, Pexels); per-post designs; live email previews in the template
      gallery, design picker and landing page (`/previews/…`).
- [x] **Invitations**: adding a subscriber sends an invitation to accept or decline
      (answered on a page, so mail scanners can't answer); unanswered ones show as
      Expired after 7 days and can be re-sent once; declining is final for the writer;
      imports can invite instead of adding; daily invitation limits per plan.
- [x] **What every competitor has**: scheduled sends (with an in-process scheduler
      that also resumes interrupted sends), embeddable signup forms, SEO basics
      (sitemap, robots, canonical), editing/unpublishing sent posts, growth chart.
- [x] **Smarter sending**: A/B subject tests (a sample gets A or B, the winner by opens or
      clicks goes to everyone else after 1–24 hours, or when the writer picks), resending
      once to people who didn't open (with a new subject), sponsor blocks with a shareable
      results page (`/sponsor/{token}`).
- [x] **Readers**: preferences page from every footer (pause 1–3 months, pick public
      topics, unsubscribe), topic checkboxes on the sign-up form, likes (one per browser)
      and comments (email-confirmed once, then remembered; author replies, moderation),
      Stats page (sources, posts that brought readers, engagement levels with filters,
      recent issues).
- [x] **Growth**: referral program (personal links, rewards with emails to both sides,
      leaderboard), recommendations (one-click subscribe after confirming), campaign
      landing pages that tag sign-ups (`/{slug}/l/{page}`), website pop-up
      (`/embed/{slug}/popup.js`).
- [x] **Automations**: welcome series and tag-triggered sequences; each email is a post
      (kind "automation") written in the normal editor; runs once per subscriber, resumable.
- [x] **Teams**: owner, editors (everything but billing and the team) and contributors
      (drafts only); invitations by email; seats per plan (1 / 5 / 25); bylines.
- [x] **Imports**: Substack export ZIP, Ghost JSON, RSS/Atom (beehiiv, WordPress…) into the
      archive with original dates (paid/members-only kept off the web) or as drafts;
      re-imports skip what's there.
- [x] **Custom domains** (Pro and Business): the publication on its own domain (proxy
      rewrite + Caddy on-demand TLS) and sending from the writer's address (Resend Domains).
- [x] **Paid newsletters**: Stripe Connect Express, monthly/yearly prices, Checkout with a
      platform fee (10% / 5% / 3% by plan), paid posts with a free preview by email, web and
      feed, emailed login links for paying readers, reader billing portal.
- [ ] **Next**: copy imported images into our storage, Connect payouts reporting, comment
      notifications for writers, a real job queue for very large lists.

## After the MVP

- **Choice of email builders**: let users pick between builders, e.g. MJML,
  Maizzle, a drag-and-drop/block editor (Unlayer, GrapesJS) or raw HTML. This is
  supported by the `EmailRenderer` interface and `content_format` column.
- A real job queue for very large lists (sending currently runs in `after()` and the
  in-process scheduler)
