import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Tribes.app',
  description: 'Terms and conditions for using the Tribes.app social networking platform.',
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <p>
        Welcome to Tribes.app. These Terms of Service (&quot;Terms&quot;) govern your access to and
        use of the Tribes.app platform (&quot;Service&quot;), operated by Clear Mirror LLC
        (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;). By creating an account or using the Service,
        you agree to be bound by these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 13 years old to use Tribes.app. By using the Service, you represent
        that you meet this age requirement. If you are between 13 and 18 years old, you must 
        have the consent of a parent or legal guardian.
      </p>

      <h2>2. Account Registration</h2>
      <ul>
        <li>You must provide accurate and complete information when creating an account.</li>
        <li>You are responsible for securing your account. Tribes.app uses passwordless authentication
        (passkeys), and you must safeguard access to your authenticator devices.</li>
        <li>You are responsible for all activity that occurs under your account.</li>
        <li>You may not create accounts for the purpose of impersonation, spam, or fraud.</li>
      </ul>

      <h2>3. Acceptable Use</h2>
      <p>When using Tribes.app, you agree NOT to:</p>
      <ul>
        <li>Post content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
        <li>Upload or distribute child sexual abuse material (CSAM) — violations are reported to NCMEC and law enforcement</li>
        <li>Infringe on the intellectual property rights of others</li>
        <li>Engage in harassment, bullying, doxxing, or stalking</li>
        <li>Spam, phish, or distribute malware</li>
        <li>Attempt to gain unauthorized access to other users&rsquo; accounts or data</li>
        <li>Circumvent platform moderation or rate-limiting measures</li>
        <li>Use automated systems (bots, scrapers) to access the Service without prior written consent</li>
        <li>Exploit the contribution or reputation system in bad faith</li>
      </ul>
      <p>
        See our <a href="/community-guidelines">Community Guidelines</a> for detailed content policies.
      </p>

      <h2>4. User-Generated Content</h2>

      <h3>4.1 Ownership</h3>
      <p>
        You retain ownership of the content you create and post on Tribes.app (&quot;Your Content&quot;).
        We do not claim ownership over your posts, comments, images, or other materials.
      </p>

      <h3>4.2 License Grant</h3>
      <p>
        By posting content on Tribes.app, you grant us a worldwide, non-exclusive, royalty-free,
        sublicensable license to host, display, distribute, and make available Your Content
        solely for the purpose of operating and providing the Service. This license ends when
        you delete Your Content or your account, except where your content has been shared with
        others and they have not deleted it, or where retention is required by law.
      </p>

      <h3>4.3 Content Removal</h3>
      <p>
        We reserve the right to remove or restrict access to content that violates these Terms
        or our Community Guidelines, as determined at our sole discretion.
      </p>

      <h2>5. Tribes and Governance</h2>
      <p>
        Tribes are community spaces within the platform. Tribe creators and speakers (moderators)
        may establish additional rules for their tribes. However, all tribe-specific rules must
        comply with these Terms and our Community Guidelines. We reserve the right to intervene
        in any tribe that violates platform-wide policies.
      </p>

      <h2>6. Subscriptions and Payments</h2>
      <ul>
        <li>Tribes.app offers free and paid subscription plans.</li>
        <li>Paid subscriptions are processed through Stripe. By subscribing, you also agree to
          <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer"> Stripe&rsquo;s Terms of Service</a>.</li>
        <li>Subscriptions renew automatically unless cancelled before the renewal date.</li>
        <li>Refunds are handled in accordance with applicable law and our refund policy.</li>
        <li>Upon account deletion, active subscriptions are cancelled immediately.</li>
      </ul>

      <h2>7. AI Features</h2>
      <p>
        Tribes.app may offer AI-powered features (e.g., T-Codex Prime assistant). These features
        are provided &quot;as is&quot; without guarantees of accuracy. AI-generated content may contain
        errors. You are responsible for verifying AI outputs before acting on them.
      </p>

      <h2>8. Intellectual Property</h2>
      <p>
        The Tribes.app platform, including its design, code, branding, and documentation, is
        protected by intellectual property laws. You may not copy, modify, distribute, or
        reverse-engineer any part of the platform without our prior written consent.
      </p>

      <h2>9. DMCA and Copyright</h2>
      <p>
        We respect the intellectual property rights of others. If you believe that content on
        Tribes.app infringes your copyright, please send a DMCA takedown notice to our
        designated agent:
      </p>
      <p>
        <strong>DMCA Agent:</strong> Clear Mirror LLC<br />
        <strong>Email:</strong> dmca@tribes.app<br />
        <strong>Address:</strong> 7210 78th Dr. NE, Marysville, WA 98270
      </p>
      <p>
        Your notice must include:
      </p>
      <ul>
        <li>Identification of the copyrighted work claimed to have been infringed</li>
        <li>Identification of the infringing material and its location on the platform</li>
        <li>Your contact information (name, address, phone, email)</li>
        <li>A statement of good faith belief that the use is not authorized</li>
        <li>A statement, under penalty of perjury, that the information in the notice is accurate</li>
        <li>Your physical or electronic signature</li>
      </ul>

      <h2>10. Account Termination</h2>
      <ul>
        <li><strong>By you:</strong> You may delete your account at any time via Settings → Account Actions.
          Account deletion is permanent and irreversible.</li>
        <li><strong>By us:</strong> We may suspend or terminate your account for violations of these Terms,
          upon notice except in cases of severe violations (CSAM, threats of violence) where
          immediate action is required.</li>
      </ul>

      <h2>11. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
        OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
        WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
      </p>

      <h2>12. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR
        REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL,
        OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless Tribes.app and its officers, directors,
        employees, and agents from and against any claims, liabilities, damages, losses, and
        expenses (including reasonable attorneys&rsquo; fees) arising out of or in any way connected
        with your use of the Service, your content, or your violation of these Terms.
      </p>

      <h2>14. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the State of Washington,
        United States, without regard to its conflict of law provisions.
      </p>

      <h2>15. Dispute Resolution</h2>
      <p>
        Any disputes arising from these Terms or your use of the Service shall first be resolved
        through good-faith negotiation. If negotiation fails, disputes shall be resolved through
        binding arbitration in Snohomish County, Washington, except that either party may seek injunctive
        relief in a court of competent jurisdiction.
      </p>

      <h2>16. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. We will notify you of material changes
        by posting a notice on the platform at least 30 days before the changes take effect.
        Your continued use of the Service after the effective date constitutes acceptance of
        the updated Terms.
      </p>

      <h2>17. Contact Us</h2>
      <p>
        For questions about these Terms, contact us at:
      </p>
      <p>
        <strong>Email:</strong> legal@tribes.app<br />
        <strong>Address:</strong> 7210 78th Dr. NE, Marysville, WA 98270
      </p>
    </article>
  );
}
