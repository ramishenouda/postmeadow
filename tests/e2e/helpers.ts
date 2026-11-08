/**
 * Helpers for end-to-end tests. They drive the real app over HTTP, the way a
 * browser would: cookies, server actions (React's wire format), and the emails
 * that land in a dedicated test Mailpit.
 *
 * Run through `npm run test:e2e`, which starts an isolated stack and sets the
 * E2E_* variables. Never point these at a database you care about: tests wipe it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import postgres from "postgres";
import { Webhook } from "standardwebhooks";

export const BASE = required("E2E_BASE");
const MAILPIT = `${required("E2E_MAILPIT")}/api/v1`;
const DATABASE_URL = required("E2E_DATABASE_URL");
export const WEBHOOK_SECRET = required("E2E_RESEND_WEBHOOK_SECRET");
const MANIFEST = required("E2E_ACTION_MANIFEST");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run the tests with: npm run test:e2e`);
  return value;
}

// ─── Database ───────────────────────────────────────────────────────────────

if (/\/newsletter$/.test(new URL(DATABASE_URL).pathname)) {
  throw new Error("Refusing to run e2e tests against the development database");
}

export const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });

/** Empties every app table. Called at the start of each test file. */
export async function resetDatabase() {
  await sql`truncate table "user", publications, subscribers, posts, deliveries,
    webhook_events, rate_limits, verification, images, account_billing restart identity cascade`;
}

/** One value from the first row, as text (like `psql -tA`). */
export async function scalar(query: ReturnType<typeof sql>): Promise<string> {
  const rows = await query;
  const first = rows[0];
  return first ? String(Object.values(first)[0]) : "";
}

// ─── HTTP client with cookies ───────────────────────────────────────────────

let ipCounter = 0;

export class Client {
  private cookies = new Map<string, string>();
  /** Each client looks like a different visitor to the rate limiter. */
  readonly ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(++ipCounter / 250) % 250}.${ipCounter % 250}`;

  constructor(private readonly extraHeaders: Record<string, string> = {}) {}

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("origin", BASE);
    headers.set("x-forwarded-for", this.ip);
    for (const [k, v] of Object.entries(this.extraHeaders)) headers.set(k, v);
    if (this.cookies.size) {
      headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const res = await fetch(path.startsWith("http") ? path : BASE + path, {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some(
        (a) => /^\s*max-age=0\s*$/i.test(a) || /^\s*expires=Thu, 01 Jan 1970/i.test(a),
      );
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  /** GET, following redirects. Returns the final response and its body. */
  async get(path: string): Promise<{ res: Response; text: string; url: string }> {
    let url = path;
    for (let i = 0; i < 5; i++) {
      const res = await this.fetch(url);
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, BASE).toString();
        continue;
      }
      return { res, text: await res.text(), url };
    }
    throw new Error(`Too many redirects from ${path}`);
  }

  /** Text of a page (follows redirects). */
  async page(path: string): Promise<string> {
    return (await this.get(path)).text;
  }

  // ─── Server actions ──────────────────────────────────────────────────────

  /** Action called with plain JSON arguments, e.g. savePost(id, input). */
  async action(page: string, file: string, name: string, args: unknown[]) {
    const res = await this.fetch(page, {
      method: "POST",
      headers: {
        "next-action": actionId(file, name),
        accept: "text/x-component",
        "content-type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify(args),
    });
    return parseActionResponse(res);
  }

  /** Action called like useActionState does: (...leadingArgs, prevState, formData). */
  async formAction(
    page: string,
    file: string,
    name: string,
    fields: Record<string, string | Blob>,
    { leadingArgs = [], prev = {} }: { leadingArgs?: unknown[]; prev?: unknown } = {},
  ) {
    const body = new FormData();
    // React reads the referenced FormData entries when it resolves the root, so they go first.
    for (const [key, value] of Object.entries(fields)) body.append(`_1_${key}`, value);
    body.append("0", JSON.stringify([...leadingArgs, prev, "$K1"]));
    const res = await this.fetch(page, {
      method: "POST",
      headers: { "next-action": actionId(file, name), accept: "text/x-component" },
      body,
    });
    return parseActionResponse(res);
  }
}

type ActionResponse = {
  status: number;
  /** The action's return value, if any. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  /** Set when the action called redirect(). */
  redirect: string | null;
};

async function parseActionResponse(res: Response): Promise<ActionResponse> {
  const text = await res.text();
  let result: unknown = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("1:") && !line.startsWith("1:D")) {
      try {
        result = JSON.parse(line.slice(2));
      } catch {
        // not JSON (e.g. a React reference); ignore
      }
    }
  }
  return { status: res.status, result, redirect: res.headers.get("x-action-redirect") };
}

let manifest: Record<string, { filename?: string; exportedName: string }> | undefined;

function actionId(file: string, name: string): string {
  manifest ??= JSON.parse(readFileSync(MANIFEST, "utf8")).node;
  for (const [id, entry] of Object.entries(manifest!)) {
    if (entry.exportedName === name && entry.filename?.includes(file)) return id;
  }
  throw new Error(`Server action ${file}#${name} not found in ${MANIFEST}`);
}

// ─── Mailpit ────────────────────────────────────────────────────────────────

export type Message = {
  ID: string;
  From: { Name: string; Address: string };
  To: { Address: string }[];
  ReplyTo: { Address: string }[];
  Subject: string;
  Text: string;
  HTML: string;
};

export const mail = {
  async clear() {
    await fetch(`${MAILPIT}/messages`, { method: "DELETE" });
  },
  async list(): Promise<Pick<Message, "ID" | "To" | "Subject">[]> {
    const res = await fetch(`${MAILPIT}/messages?limit=1000`);
    return (await res.json()).messages;
  },
  async total(): Promise<number> {
    const res = await fetch(`${MAILPIT}/messages?limit=1`);
    return (await res.json()).total;
  },
  async find(to: string, subject = ""): Promise<Message | null> {
    for (const m of await this.list()) {
      if (m.To.some((t) => t.Address === to) && m.Subject.includes(subject)) {
        return (await fetch(`${MAILPIT}/message/${m.ID}`)).json();
      }
    }
    return null;
  },
  async waitFor(to: string, subject = "", timeoutMs = 10_000): Promise<Message> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const m = await this.find(to, subject);
      if (m) return m;
      await sleep(200);
    }
    throw new Error(`No email to ${to} with subject containing "${subject}"`);
  },
  async headers(id: string): Promise<Record<string, string[]>> {
    return (await fetch(`${MAILPIT}/message/${id}/headers`)).json();
  },
  async countTo(address: string): Promise<number> {
    return (await this.list()).filter((m) => m.To.some((t) => t.Address === address)).length;
  },
};

/** First URL in the email's plain-text part that starts with BASE + path. */
export function linkIn(message: Message, path: string): string {
  const escaped = (BASE + path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = message.Text.match(new RegExp(`${escaped}\\S+`));
  assert.ok(match, `No ${path} link in email "${message.Subject}"`);
  return match[0];
}

// ─── Flows ──────────────────────────────────────────────────────────────────

/** Signs in through the real magic-link email. */
export async function signIn(email: string): Promise<Client> {
  const client = new Client();
  const res = await client.fetch("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, callbackURL: "/dashboard", newUserCallbackURL: "/onboarding" }),
  });
  assert.equal(res.status, 200, await res.text());
  const message = await mail.waitFor(email, "sign-in");
  await client.fetch(linkIn(message, "/api/auth/magic-link/verify"));
  return client;
}

/** Signs in and creates a publication. */
export async function createOwner(email: string, slug: string, name = "Test Publication") {
  const owner = await signIn(email);
  const { result } = await owner.formAction(
    "/onboarding",
    "onboarding/actions",
    "createPublication",
    {
      name,
      slug,
      description: "",
      fromName: name,
      replyTo: "",
    },
  );
  assert.equal(
    await scalar(sql`select count(*) from publications where slug = ${slug}`),
    "1",
    `publication not created: ${JSON.stringify(result)}`,
  );
  const publicationId = await scalar(sql`select id from publications where slug = ${slug}`);
  return { owner, publicationId };
}

/** Adds confirmed subscribers directly (fast setup for sending tests). */
export async function seedSubscribers(publicationId: string, emails: string[]) {
  const rows = emails.map((email) => ({
    publication_id: publicationId,
    email,
    status: "active",
    confirmed_at: new Date(),
    unsubscribe_token: `t_${crypto.randomUUID()}`,
  }));
  await sql`insert into subscribers ${sql(rows)}`;
}

/** Creates a draft with content and returns its id. */
export async function createDraft(owner: Client, title: string, slug: string, content = "Hi") {
  await owner.action("/dashboard/posts", "posts/actions", "createPost", []);
  const id = await scalar(
    sql`select id from posts where status = 'draft' order by created_at desc limit 1`,
  );
  const { result } = await owner.action(`/dashboard/posts/${id}`, "posts/actions", "savePost", [
    id,
    { title, subtitle: "", slug, content },
  ]);
  assert.equal(result?.ok, true, JSON.stringify(result));
  return id;
}

export async function waitForStatus(postId: string, status: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await scalar(sql`select status from posts where id = ${postId}`)) === status) return;
    await sleep(300);
  }
  throw new Error(`Post ${postId} did not reach status ${status}`);
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

/** Posts an event to the Resend webhook, signed like Resend (Svix) does. */
export async function sendResendEvent(
  event: { type: string; data: Record<string, unknown> },
  { id = `msg_${crypto.randomUUID()}`, secret = WEBHOOK_SECRET } = {},
) {
  const payload = JSON.stringify({ created_at: new Date().toISOString(), ...event });
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  return fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
    body: payload,
  });
}
