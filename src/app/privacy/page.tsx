import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { APP_NAME } from "@/lib/brand";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${APP_NAME} collects, why, and your rights.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`This explains what personal data ${APP_NAME} handles, why, who helps us, and your rights. We collect as little as we can, never sell data, and don't use advertising trackers.`}
    >
      <h2>Who we are</h2>
      <p>
        {APP_NAME} is run by {OPERATOR.name}, {OPERATOR.address}, {OPERATOR.country}. For anything
        about privacy, write to {OPERATOR.email}.
      </p>

      <h2>Two kinds of people, two roles</h2>
      <ul>
        <li>
          <strong>Writers</strong> (people with a {APP_NAME} account): we decide how your account
          data is used, so we are the <em>controller</em>.
        </li>
        <li>
          <strong>Readers</strong> (people subscribed to a newsletter): the writer decides whom to
          email and what to send, so the writer is the controller and we are their{" "}
          <em>processor</em>. If you&apos;re a reader, the writer is your first point of contact;
          we&apos;ll help them, and you, if you write to us.
        </li>
      </ul>

      <h2>What we collect</h2>
      <h3>From writers</h3>
      <ul>
        <li>Your email address and name, to sign you in (by email link; we store no passwords).</li>
        <li>
          Your publication: its name, settings, postal address, posts and the images you upload.
        </li>
        <li>
          Billing: your plan and subscription status. Card details go straight to Stripe; we never
          see or store them.
        </li>
      </ul>
      <h3>From readers</h3>
      <ul>
        <li>Your email address, subscription status and the dates it changed.</li>
        <li>
          Which issues were delivered to you and, if the email provider reports it, whether they
          bounced, were opened, or links in them were clicked. Opens are measured with a small image
          and clicks with a redirect, so the writer can see what readers find useful.
        </li>
        <li>Any tags the writer adds to organise their list.</li>
      </ul>
      <h3>From everyone</h3>
      <ul>
        <li>
          Your IP address, briefly, to stop abuse of sign-up forms (deleted within a day), and in
          server logs for security, which are rotated automatically and kept only briefly.
        </li>
        <li>
          One cookie, to keep writers signed in. We use no analytics, advertising or tracking
          cookies.
        </li>
      </ul>

      <h2>Why (legal bases)</h2>
      <ul>
        <li>To provide the service you signed up for (contract).</li>
        <li>
          To keep the service secure and protect our sending reputation, for example by stopping
          spam (our legitimate interest).
        </li>
        <li>To keep billing records as tax law requires (legal obligation).</li>
        <li>
          To email readers, on the writer&apos;s instructions, based on the reader&apos;s
          subscription (which they confirm by email).
        </li>
      </ul>

      <h2>Who helps us (processors)</h2>
      <ul>
        <li>Hosting: our servers and database are hosted in the EU (Germany).</li>
        <li>Resend, to send emails and report deliveries, bounces and complaints.</li>
        <li>Stripe, for payments.</li>
        <li>Sentry, to report errors in our software (we keep personal data out of reports).</li>
        <li>An S3-compatible storage provider, for encrypted off-site backups.</li>
      </ul>
      <p>
        Some of these may process data outside the EU; where they do, they use safeguards such as
        the EU Standard Contractual Clauses.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data: until you delete your account, which removes it straight away.</li>
        <li>Backups: deleted data disappears from backups within 30 days.</li>
        <li>
          Readers who unsubscribe or decline an invitation: the writer&apos;s list keeps their
          address marked as such, so they aren&apos;t emailed again.
        </li>
        <li>Billing records: as long as tax law requires.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct, export or delete your data, object to how we use it, or
        restrict it. Writers can export their list and delete their account themselves in the
        dashboard. Readers can unsubscribe with one click in any email. For anything else, write to{" "}
        {OPERATOR.email}; we answer within 30 days. You can also complain to your data protection
        authority.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that matters, we&apos;ll tell writers by email before it
        takes effect.
      </p>
    </LegalPage>
  );
}
