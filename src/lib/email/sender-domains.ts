import "server-only";
import { Resend } from "resend";
import type { DnsRecord } from "@/db/schema";
import { env } from "@/env";

/**
 * Sending domains: the writer's own domain, verified with the email provider (Resend)
 * through DNS records (SPF, DKIM and a bounce MX). With the SMTP transport (development
 * and tests) there's no provider, so a stand-in returns example records and verifies
 * on the first check.
 */

export type SenderDomain = {
  id: string;
  status: "pending" | "verified" | "failed";
  records: DnsRecord[];
};

interface DomainProvider {
  create(domain: string): Promise<SenderDomain>;
  check(id: string): Promise<SenderDomain>;
  remove(id: string): Promise<void>;
}

const status = (s: string | undefined): SenderDomain["status"] =>
  s === "verified"
    ? "verified"
    : s === "failed" || s === "temporary_failure"
      ? "failed"
      : "pending";

type ResendRecord = {
  type?: string;
  record?: string;
  name: string;
  value: string;
  priority?: number;
  status?: string;
};

function resendProvider(): DomainProvider {
  const resend = new Resend(env.RESEND_API_KEY);
  const toDomain = (d: {
    id: string;
    status?: string;
    records?: ResendRecord[];
  }): SenderDomain => ({
    id: d.id,
    status: status(d.status),
    records: (d.records ?? []).map((r) => ({
      type: r.type ?? r.record ?? "TXT",
      name: r.name,
      value: r.value,
      priority: r.priority ?? null,
      status: r.status ?? null,
    })),
  });
  return {
    async create(domain) {
      const { data, error } = await resend.domains.create({ name: domain });
      if (error || !data) throw new Error(error?.message ?? "Couldn't add the domain.");
      return toDomain(data as never);
    },
    async check(id) {
      await resend.domains.verify(id);
      const { data, error } = await resend.domains.get(id);
      if (error || !data) throw new Error(error?.message ?? "Couldn't check the domain.");
      return toDomain(data as never);
    },
    async remove(id) {
      await resend.domains.remove(id);
    },
  };
}

function localProvider(): DomainProvider {
  const records = (id: string): DnsRecord[] => {
    const domain = id.replace(/^local:/, "");
    return [
      { type: "MX", name: `send.${domain}`, value: "feedback-smtp.example.com", priority: 10 },
      { type: "TXT", name: `send.${domain}`, value: "v=spf1 include:example.com ~all" },
      { type: "TXT", name: `resend._domainkey.${domain}`, value: "p=MIGfMA0GCSqGSIb3DQEB…" },
    ];
  };
  return {
    async create(domain) {
      return { id: `local:${domain}`, status: "pending", records: records(`local:${domain}`) };
    },
    async check(id) {
      return { id, status: "verified", records: records(id) };
    },
    async remove() {},
  };
}

export const domainProvider = (): DomainProvider =>
  env.EMAIL_TRANSPORT === "resend" ? resendProvider() : localProvider();

/** The writer's own From address, once its domain is verified; otherwise null. */
export const senderAddress = (p: {
  senderEmail?: string | null;
  senderDomainStatus?: string | null;
}) => (p.senderEmail && p.senderDomainStatus === "verified" ? p.senderEmail : null);
