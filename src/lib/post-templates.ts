/**
 * Starter templates: ready-made structures for common kinds of issue. Writers pick one
 * when starting a post (Posts → New post). The words in them are prompts to replace.
 * Markdown, limited to what the editor supports (see tests/unit/post-templates.test.ts).
 */

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  subtitle: string;
  content: string;
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "weekly-roundup",
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
