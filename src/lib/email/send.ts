import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Defaults to EMAIL_FROM. */
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SendResult = { id: string };
export type BatchResult = { ok: true; id: string } | { ok: false; error: string };

interface EmailTransport {
  send(message: EmailMessage): Promise<SendResult>;
  /** Results are in the same order as the messages. */
  sendBatch(messages: EmailMessage[]): Promise<BatchResult[]>;
  /** Largest batch the transport accepts in one call. */
  maxBatchSize: number;
  /** Pause between batches to stay under the provider's rate limit. */
  batchDelayMs: number;
}

/** SMTP transport. Used with Mailpit in development. */
function smtpTransport(): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    pool: true,
  });
  const send = async (m: EmailMessage): Promise<SendResult> => {
    const info = await transporter.sendMail({
      from: m.from ?? env.EMAIL_FROM,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      replyTo: m.replyTo,
      headers: m.headers,
    });
    return { id: info.messageId };
  };
  return {
    send,
    async sendBatch(messages) {
      const results: BatchResult[] = [];
      for (const m of messages) {
        try {
          results.push({ ok: true, ...(await send(m)) });
        } catch (error) {
          results.push({ ok: false, error: errorMessage(error) });
        }
      }
      return results;
    },
    maxBatchSize: 50,
    batchDelayMs: 0,
  };
}

/** Resend transport. Used in production. */
function resendTransport(): EmailTransport {
  const resend = new Resend(env.RESEND_API_KEY);
  const toResend = (m: EmailMessage) => ({
    from: m.from ?? env.EMAIL_FROM,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    replyTo: m.replyTo,
    headers: m.headers,
  });
  return {
    async send(m) {
      const { data, error } = await resend.emails.send(toResend(m));
      if (error || !data) throw new Error(`Resend error: ${error?.message ?? "no data"}`);
      return { id: data.id };
    },
    async sendBatch(messages) {
      const { data, error } = await resend.batch.send(messages.map(toResend));
      if (error || !data) {
        const message = `Resend error: ${error?.message ?? "no data"}`;
        return messages.map(() => ({ ok: false as const, error: message }));
      }
      return messages.map((_, i) =>
        data.data[i]
          ? { ok: true as const, id: data.data[i].id }
          : { ok: false as const, error: "Resend returned no id" },
      );
    },
    maxBatchSize: 100, // Resend batch API limit
    batchDelayMs: 600, // stay under Resend's default rate limit
  };
}

let transport: EmailTransport | undefined;

function getTransport(): EmailTransport {
  transport ??= env.EMAIL_TRANSPORT === "resend" ? resendTransport() : smtpTransport();
  return transport;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  return getTransport().send(message);
}

export function batchTransport() {
  const t = getTransport();
  return {
    sendBatch: t.sendBatch.bind(t),
    maxBatchSize: t.maxBatchSize,
    batchDelayMs: t.batchDelayMs,
  };
}

/** `"Publication Name" <address from EMAIL_FROM>`. The address must be on your verified domain. */
export function fromWithName(name: string): string {
  const match = env.EMAIL_FROM.match(/<([^>]+)>/);
  const address = (match ? match[1] : env.EMAIL_FROM).trim();
  const safeName = name.replace(/[\r\n]+/g, " ").replace(/["\\]/g, "\\$&");
  return `"${safeName}" <${address}>`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
