"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DnsRecord } from "@/db/schema";
import {
  checkSenderDomain,
  removeCustomDomain,
  removeSenderDomain,
  setCustomDomain,
  setSenderEmail,
  verifyCustomDomain,
  type DomainResult,
} from "./domain-actions";

function useResult() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DomainResult | null>(null);
  const run = (action: () => Promise<DomainResult>) =>
    startTransition(async () => setResult(await action()));
  const message = result ? (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm text-emerald-700" : "text-destructive text-sm"}
    >
      {result.ok ? result.message : result.error}
    </p>
  ) : null;
  return { pending, run, message };
}

function RecordTable({ records }: { records: DnsRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground border-b">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Priority</th>
          </tr>
        </thead>
        <tbody className="divide-y font-mono">
          {records.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2">{r.type}</td>
              <td className="px-3 py-2 break-all">{r.name}</td>
              <td className="px-3 py-2 break-all">{r.value}</td>
              <td className="px-3 py-2">{r.priority ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Badge = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span
    className={
      ok
        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
        : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
    }
  >
    {children}
  </span>
);

export function DomainsSection({
  allowed,
  target,
  customDomain,
  verified,
  senderEmail,
  senderStatus,
  senderRecords,
  defaultFrom,
}: {
  allowed: boolean;
  target: string;
  customDomain: string | null;
  verified: boolean;
  senderEmail: string | null;
  senderStatus: string | null;
  senderRecords: DnsRecord[];
  defaultFrom: string;
}) {
  const web = useResult();
  const mail = useResult();
  const apex = customDomain ? customDomain.split(".").length === 2 : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your own domains</CardTitle>
        <CardDescription>
          Put your publication on your own web address, and send from your own email address.
          {allowed ? null : (
            <>
              {" "}
              Available on the Pro and Business plans.{" "}
              <Link href="/dashboard/billing" className="underline">
                Upgrade
              </Link>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-3" aria-labelledby="web-domain">
          <div className="flex items-center gap-2">
            <h3 id="web-domain" className="text-sm font-medium">
              Web address
            </h3>
            {customDomain ? (
              <Badge ok={verified}>{verified ? "Connected" : "Waiting for DNS"}</Badge>
            ) : null}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("domain") ?? "");
              web.run(() => setCustomDomain(value));
            }}
          >
            <Input
              name="domain"
              defaultValue={customDomain ?? ""}
              placeholder="news.yourbrand.com"
              aria-label="Your domain"
              className="min-w-56 flex-1"
              disabled={!allowed}
            />
            <Button type="submit" variant="outline" disabled={!allowed || web.pending}>
              Save
            </Button>
          </form>
          {customDomain && !verified ? (
            <div className="space-y-2 text-sm">
              <p>At your domain provider, add this record:</p>
              <RecordTable
                records={[
                  apex
                    ? { type: "A", name: "@", value: `the IP address of ${target}` }
                    : { type: "CNAME", name: customDomain.split(".")[0], value: target },
                ]}
              />
              <Button size="sm" disabled={web.pending} onClick={() => web.run(verifyCustomDomain)}>
                Check DNS
              </Button>
            </div>
          ) : null}
          {customDomain && verified ? (
            <p className="text-sm">
              Live at{" "}
              <a
                href={`https://${customDomain}`}
                className="underline"
                target="_blank"
                rel="noopener"
              >
                https://{customDomain}
              </a>
              . Emails and your feed link there now.
            </p>
          ) : null}
          {customDomain ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={web.pending}
              onClick={() => web.run(removeCustomDomain)}
            >
              Remove domain
            </Button>
          ) : null}
          {web.message}
        </section>

        <section className="space-y-3" aria-labelledby="sender-domain">
          <div className="flex items-center gap-2">
            <h3 id="sender-domain" className="text-sm font-medium">
              Sending address
            </h3>
            {senderEmail ? (
              <Badge ok={senderStatus === "verified"}>
                {senderStatus === "verified"
                  ? "Verified"
                  : senderStatus === "failed"
                    ? "Failed"
                    : "Waiting for DNS"}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {senderStatus === "verified" && senderEmail
              ? `Issues come from ${senderEmail}.`
              : `Issues come from ${defaultFrom} until your address is verified.`}
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("email") ?? "");
              mail.run(() => setSenderEmail(value));
            }}
          >
            <Input
              name="email"
              type="email"
              defaultValue={senderEmail ?? ""}
              placeholder="hello@yourbrand.com"
              aria-label="Your sending address"
              className="min-w-56 flex-1"
              disabled={!allowed}
            />
            <Button type="submit" variant="outline" disabled={!allowed || mail.pending}>
              Save
            </Button>
          </form>
          {senderEmail && senderStatus !== "verified" && senderRecords.length ? (
            <div className="space-y-2 text-sm">
              <p>Add these records at your domain provider, then check:</p>
              <RecordTable records={senderRecords} />
              <Button size="sm" disabled={mail.pending} onClick={() => mail.run(checkSenderDomain)}>
                Check records
              </Button>
            </div>
          ) : null}
          {senderEmail ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={mail.pending}
              onClick={() => mail.run(removeSenderDomain)}
            >
              Stop using this address
            </Button>
          ) : null}
          {mail.message}
        </section>
      </CardContent>
    </Card>
  );
}
