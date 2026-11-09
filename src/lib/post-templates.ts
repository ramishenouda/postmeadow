import type { EmailDesign } from "@/lib/email-designs";

/**
 * Starter templates: ready-made issues for common kinds of newsletter. Writers pick
 * one when starting a post (Posts → New post). The words in them are prompts to
 * replace; the photos are real and free to keep (public/templates/CREDITS.txt).
 * Markdown, limited to what the editor supports (see tests/unit/post-templates.test.tsx).
 *
 * `{{assets}}` stands for where the template photos are served; starterContent()
 * fills it in with an absolute URL, because emails need absolute image addresses.
 */

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  /** Who it's for, shown as a tag. */
  category: "Shops" | "Tech" | "Games" | "Writers";
  /** A design the template is made for; posts started from it use that design. */
  design?: EmailDesign;
  title: string;
  subtitle: string;
  content: string;
};

export const ASSETS = "{{assets}}";

/** The template's Markdown with photo addresses made absolute for `appUrl`. */
export function starterContent(template: StarterTemplate, appUrl: string): string {
  return template.content.replaceAll(ASSETS, `${appUrl.replace(/\/$/, "")}/templates`);
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "new-collection",
    name: "New collection",
    description: "A cover photo, a row of products with prices, and a big “Shop now”.",
    category: "Shops",
    design: "boutique",
    title: "The Autumn Edit is here",
    subtitle: "Soft knits, warm coats and the leather jacket you'll wear for years",
    content: `![A woman in a long trench coat walking past a sunlit wall](${ASSETS}/fashion/hero.jpg)

Hi there,

The days are getting shorter, so our new collection is all about layers: soft, warm and made to last. Here are the pieces our team can't stop wearing.

## New in

![Cable-knit sweaters in oat, camel and sand](${ASSETS}/fashion/knit.jpg "Cable-knit sweater · $89")

![Leather and suede jackets on a rail](${ASSETS}/fashion/jackets.jpg "Vintage leather jacket · $240")

![A woman in a teddy coat in warm autumn light](${ASSETS}/fashion/coat.jpg "Teddy wool coat · $195")

[Shop the collection](https://example.com)

## Made to last

A short paragraph about the collection: the materials, where it's made, or the story behind it. Readers who know why you made something are more likely to love it.

> “The coat I've wanted for years. Warm, light, and it goes with everything.” A happy customer

## Free returns, always

Free shipping on orders over $100, and 30 days to change your mind.

[Find your size](https://example.com)`,
  },
  {
    id: "product-launch",
    name: "Product launch",
    description: "Announce something new: what it is, the highlights, and a clear call to try it.",
    category: "Tech",
    design: "launch",
    title: "Introducing [Product] 2.0",
    subtitle: "Faster, smarter, and built around the feedback you sent us",
    content: `![A dark desk with a glowing monitor](${ASSETS}/tech/hero.jpg)

Today we're launching **[Product] 2.0**, our biggest update yet. It's faster, it works on your phone, and it's free for everyone on your current plan.

[Try it now →](https://example.com)

## What's new

![A phone showing the new mobile app](${ASSETS}/tech/phone.jpg "Mobile app · Everything, in your pocket")

![Colourful code on a screen](${ASSETS}/tech/code.jpg "Developer API · Build on top of it")

### Twice as fast

We rebuilt the engine from scratch. Pages open in under a second, even in big projects.

### Works offline

Keep going on a plane or a train; everything syncs when you're back online.

### Your most-requested features

- Dark mode, the most requested feature of the year
- Keyboard shortcuts for everything
- Export to CSV and PDF

## For developers

Install the new SDK with \`npm install [your-sdk]\` and you're one call away from everything the app can do.

Thanks for building with us. Reply to this email and tell us what you think: the whole team reads every answer.

[Read the full changelog](https://example.com)`,
  },
  {
    id: "game-update",
    name: "Game update",
    description: "Season drops and patch notes: a loud headline, screenshots and what changed.",
    category: "Games",
    design: "arcade",
    title: "Season 3 is live: Neon Nights",
    subtitle: "A new map, two new heroes and the biggest balance patch yet",
    content: `![A gaming setup glowing pink and blue](${ASSETS}/gaming/hero.jpg)

The wait is over. **Season 3: Neon Nights** drops today with a brand-new city map, two new heroes and a reworked ranked mode.

[Play now](https://example.com)

## What's in the drop

![A glowing see-through controller](${ASSETS}/gaming/controller.jpg "New controls · Fully remappable")

![A player in a headset at a neon-lit desk](${ASSETS}/gaming/player.jpg "Ranked · Rebuilt from scratch")

![A purple-lit gaming setup](${ASSETS}/gaming/setup.jpg "Neon City · The new map")

## Patch notes

- **Neon City**: a vertical map with rooftops, zip lines and a night market
- **Two new heroes**: Vex, a trickster, and Halo, a support who shields the team
- **Ranked**: placement in 5 games instead of 10, and your rating is now visible
- **Fixes**: more than 40, including the wall clip on Harbor

## Community clip of the week

A one-versus-four clutch on Harbor by [player name]. Want to be featured? Reply with your best clip.

[Watch the trailer](https://example.com)

GG, see you in the city.`,
  },
  {
    id: "weekly-roundup",
    category: "Writers",
    name: "Weekly roundup",
    description: "A main story, a few links worth reading, and a closing thought.",
    title: "This week: [the headline]",
    subtitle: "[One line on what's inside]",
    content: `Hi everyone,

A quick intro: what you've been up to, and what's in this issue.

## The big story

What happened, and why it matters to your readers.

## Worth reading

- [Article title](https://example.com): one line on why it's good.
- [Article title](https://example.com): one line on why it's good.
- [Article title](https://example.com): one line on why it's good.

## One more thing

A small closing thought, a question for readers, or a photo.

Until next week,`,
  },
  {
    id: "announcement",
    category: "Writers",
    name: "Announcement",
    description: "Share news: what's new, why, and what happens next.",
    title: "Introducing [the news]",
    subtitle: "[The news in one sentence]",
    content: `We've got news: **one sentence that says what's new**.

## What's new

- The first thing that changed
- The second thing
- The third thing

## Why we did it

The story behind it, in a paragraph or two.

## What happens next

When it's available, what readers need to do, and where to find out more.

[Learn more](https://example.com)`,
  },
  {
    id: "personal-letter",
    category: "Writers",
    name: "Personal letter",
    description: "A warm, personal note: one idea, told like a letter to a friend.",
    title: "[A short, personal title]",
    subtitle: "",
    content: `Hi friend,

Start with how you are, or what's been on your mind this week.

Then the heart of the letter: one idea, story or question you've been turning over.

> A line you read or heard that stuck with you.

Close with something warm, and an invitation to reply. I read every email.

Talk soon,`,
  },
  {
    id: "link-digest",
    category: "Writers",
    name: "Link digest",
    description: "A curated list of links, each with a short note on why it's worth a click.",
    title: "[Number] things worth your time",
    subtitle: "[A theme, or just this week's finds]",
    content: `Here are the best things I found this week.

### [Title of the first link](https://example.com)

Two sentences on what it is and why it's worth your time.

### [Title of the second link](https://example.com)

Two sentences on what it is and why it's worth your time.

### [Title of the third link](https://example.com)

Two sentences on what it is and why it's worth your time.

---

Found something I should read? Reply and send it over.`,
  },
  {
    id: "interview",
    category: "Writers",
    name: "Interview",
    description: "A Q&A with someone interesting, introduced in a sentence.",
    title: "A conversation with [name]",
    subtitle: "[Their role, and what you talked about]",
    content: `This week I spoke with **[name]**, [role] at [company], about [topic].

## Who are you, and what do you do?

The answer, in their words.

## How did you get started?

The answer, in their words.

## What's the best advice you've ever received?

The answer, in their words.

## Where can people find you?

[Their website](https://example.com)`,
  },
];

export const starterTemplate = (id: string) => STARTER_TEMPLATES.find((t) => t.id === id) ?? null;
