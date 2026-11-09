import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { APP_NAME } from "@/lib/brand";
import { OPERATOR } from "@/lib/legal";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `The rules for using ${APP_NAME}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro={`These terms are the agreement between you and ${OPERATOR.name} (“we”), who runs ${APP_NAME}. By creating an account you accept them.`}
    >
      <h2>1. The service</h2>
      <p>
        {APP_NAME} lets you write a newsletter, collect subscribers on a public page and send issues
        to them by email. We may improve, change or remove features over time; if a change takes
        away something you pay for, we&apos;ll tell you in advance.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 16 years old, and give a working email address.</li>
        <li>
          You&apos;re responsible for what happens in your account. Tell us at {OPERATOR.email} if
          you think someone else has access.
        </li>
        <li>One person or organisation per account.</li>
      </ul>

      <h2>3. Your content and your list</h2>
      <p>
        You keep all rights to what you write and upload, and to your subscriber list. You give us
        permission to store, process and send it only as needed to run the service for you (for
        example, to show your posts on your public page and email them to your subscribers). You can
        export your list and delete your account at any time.
      </p>
      <p>
        For your subscribers&apos; personal data, you are the controller and we process it on your
        behalf, as described in our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You may only email people who agreed to hear from you. In particular, you must not:</p>
      <ul>
        <li>
          send to bought, rented, scraped or shared lists, or add people without their permission;
        </li>
        <li>send spam, phishing, malware, or misleading subject lines or sender names;</li>
        <li>
          publish anything illegal, hateful, harassing, sexually exploitative, or that infringes
          someone else&apos;s rights;
        </li>
        <li>try to get around plan limits, rate limits or our anti-abuse measures.</li>
      </ul>
      <p>
        Every newsletter includes an unsubscribe link and your postal address, as anti-spam laws
        require. Keep your address up to date.
      </p>

      <h2>5. Limits, suspension and termination</h2>
      <p>
        To protect our sending reputation, which every customer depends on, we watch bounce and
        spam-complaint rates. We may pause sending or suspend an account that breaks these terms or
        puts the service at risk, and will tell you why. If the problem is serious or keeps
        happening, we may close the account. You can close your account yourself in Settings at any
        time.
      </p>

      <h2>6. Plans and payment</h2>
      <ul>
        <li>
          The Free plan includes up to {PLANS.free.subscribers.toLocaleString("en")} subscribers and{" "}
          {PLANS.free.emailsPerMonth.toLocaleString("en")} emails a month. Paid plans and their
          limits are listed on the <Link href="/pricing">pricing page</Link>.
        </li>
        <li>
          Paid plans renew automatically each month or year until you cancel. Payments are handled
          by Stripe. When you cancel, your plan stays active until the end of the period you&apos;ve
          paid for, then you move to Free.
        </li>
        <li>
          Past the limits, people can still subscribe, but sending pauses until you upgrade or (for
          the monthly email limit) until the next month.
        </li>
        <li>
          Prices may change; we&apos;ll give you at least 30 days&apos; notice before a change
          applies to you. Taxes may be added where required.
        </li>
      </ul>

      <h2>7. Availability and liability</h2>
      <p>
        We work hard to keep {APP_NAME} running and your data safe, with daily backups, but we
        can&apos;t promise the service will always be available or error-free, or that every email
        will be delivered (inbox providers decide that). To the extent the law allows, we&apos;re
        not liable for indirect or consequential losses, and our total liability is limited to what
        you paid us in the 12 months before the claim. Nothing in these terms limits liability that
        can&apos;t be limited by law.
      </p>

      <h2>8. Changes to these terms</h2>
      <p>
        If we change these terms in a way that matters, we&apos;ll email you at least 30 days before
        the change takes effect. If you keep using {APP_NAME} after that, the new terms apply.
      </p>

      <h2>9. Law and contact</h2>
      <p>
        These terms are governed by {OPERATOR.governingLaw}. Questions, complaints and abuse
        reports: {OPERATOR.email}, or by post to {OPERATOR.name}, {OPERATOR.address},{" "}
        {OPERATOR.country}.
      </p>
    </LegalPage>
  );
}
