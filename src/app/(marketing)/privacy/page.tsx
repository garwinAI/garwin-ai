import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Garwin AI collects, uses and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 13, 2026">
      <LegalSection title="Overview">
        <p>
          This policy explains what information Garwin AI (&ldquo;Garwin AI&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you use
          garwinai.com and the Garwin AI workspace, how we use it, and the choices you have.
        </p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <ul>
          <li><strong>Account details:</strong> your name, email address and, if you add one, phone number. Your password is stored only as a salted hash.</li>
          <li><strong>Workspace content:</strong> the files, calendar entries, contacts and messages you and your team add to Garwin AI.</li>
          <li><strong>Security and device information:</strong> IP address, browser and device type, and sign-in activity. You can see this history under Settings.</li>
          <li><strong>Team information:</strong> if you invite someone, the email address or phone number you enter for them.</li>
          <li><strong>Billing information:</strong> when paid plans are available, payments are handled by our payment processor. We do not store full card numbers.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use information">
        <ul>
          <li>To provide the workspace and keep your account signed in on your devices.</li>
          <li>To send account emails and messages, such as email verification, password resets and team invitations.</li>
          <li>To protect accounts, for example by limiting repeated sign-in attempts and showing you your sign-in history.</li>
          <li>To answer support requests and to fix and improve the service.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="AI Assistant">
        <p>
          When you use the Assistant, the text you send it is processed by our AI provider in order to produce a response. Do not send the Assistant
          information you are not permitted to share.
        </p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>
          We use trusted providers to run Garwin AI, including hosting, database, email and text message delivery, AI processing and, for paid plans,
          payment processing. They receive only the information needed to perform their service for us.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>Garwin AI uses a single essential cookie to keep you signed in. It is not used for advertising.</p>
      </LegalSection>

      <LegalSection title="Teams and shared workspaces">
        <p>
          If you join someone else&rsquo;s workspace, the host of that workspace controls it and can see the content you add there, set your
          permissions and remove your access.
        </p>
      </LegalSection>

      <LegalSection title="Support access">
        <p>
          Garwin AI staff do not silently sign in to your account. If support access to your workspace is ever needed, it is requested with a
          reason, must be approved by you, is limited in time and scope, and is recorded.
        </p>
      </LegalSection>

      <LegalSection title="Retention and your choices">
        <p>
          We keep your information for as long as your account is open and as needed to meet legal obligations. You can update your profile, change
          your password and sign out other devices in Settings. To request a copy or deletion of your data, contact support from inside your account.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Garwin AI is not intended for children under 13, and we do not knowingly collect their information.</p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>If we make material changes, we will update the date above and, where appropriate, notify you in the app or by email.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about this policy? Message support from inside your Garwin AI account.</p>
      </LegalSection>
    </LegalPage>
  );
}
