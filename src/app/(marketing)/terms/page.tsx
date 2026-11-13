import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms that apply when you use Garwin AI.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 13, 2026">
      <LegalSection title="Agreement">
        <p>
          These terms apply to your use of garwinai.com and the Garwin AI workspace (the &ldquo;Service&rdquo;). By creating an account or using
          the Service, you agree to them. If you do not agree, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <ul>
          <li>Provide accurate information and keep your password confidential.</li>
          <li>You are responsible for activity under your account, including activity by team members you invite.</li>
          <li>Tell us promptly if you believe your account has been accessed without permission.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Plans and billing">
        <p>
          Garwin AI offers a Free plan and paid plans (Starter, Plus and Pro) with the limits shown on our{" "}
          <Link href="/#plans" className="font-medium text-brand-700 underline">Plans</Link> section. Paid plans bill in advance, monthly or
          yearly, at the price shown when you subscribe, and renew until cancelled. We may change prices for future billing periods with notice.
        </p>
      </LegalSection>

      <LegalSection title="Teams">
        <p>
          The account owner (the host) controls the workspace, including who is invited, what each team member may do, and permanent deletion of
          content. Team members share the host&rsquo;s plan and storage.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep ownership of the content you add to Garwin AI. You give us permission to store, process and display it only as needed to operate
          the Service for you and your team. You are responsible for having the rights to the content you add.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <ul>
          <li>Do not use the Service to break the law or to infringe the rights of others.</li>
          <li>Do not upload malware, attempt to gain unauthorized access, or interfere with the Service or other users.</li>
          <li>Do not resell or misuse the Service, or try to get around plan limits.</li>
        </ul>
      </LegalSection>

      <LegalSection title="AI features">
        <p>
          The Assistant and other AI features can produce inaccurate or incomplete results. Review AI output before relying on it, especially for
          legal, financial, medical or other important decisions.
        </p>
      </LegalSection>

      <LegalSection title="AppZone">
        <p>
          AppZone items may be provided by independent developers. Each developer is responsible for their own item. Additional terms and prices may
          apply to items you download or buy.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          Garwin AI is under active development. Features may be added, changed or removed, and the Service may occasionally be unavailable. We may
          update these terms; if we make material changes we will update the date above and, where appropriate, notify you.
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>
          You may stop using the Service at any time. We may suspend or close accounts that violate these terms or put the Service or other users at
          risk.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers and liability">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind to the extent permitted by
          law. To the extent permitted by law, Garwin AI is not liable for indirect, incidental or consequential damages, or for loss of data or
          profits, arising from your use of the Service.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms? Message support from inside your Garwin AI account. See also our{" "}
          <Link href="/privacy" className="font-medium text-brand-700 underline">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
