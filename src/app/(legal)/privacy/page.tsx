import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Tribes.app',
  description: 'How Tribes.app collects, uses, and protects your personal information.',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <p>
        Tribes.app (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy.
        This Privacy Policy explains how we collect, use, disclose, and safeguard your information
        when you use our social networking platform.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Account Information</h3>
      <p>When you create an account, we collect:</p>
      <ul>
        <li><strong>Identity data:</strong> Your name, email address, and profile avatar.</li>
        <li><strong>Authentication data:</strong> Passkey (WebAuthn) credentials. We never store passwords — authentication is handled via industry-standard FIDO2/WebAuthn protocols.</li>
        <li><strong>OAuth data:</strong> If you sign in via Google, we receive your name, email, and profile picture from your Google account.</li>
      </ul>

      <h3>1.2 Content You Create</h3>
      <p>We store content you voluntarily provide:</p>
      <ul>
        <li>Posts, comments, and reactions (&quot;vibes&quot;)</li>
        <li>Images and files you upload</li>
        <li>Profile information including bio, aliases, and personal wall blocks</li>
        <li>Event RSVPs and event stream posts</li>
        <li>Bond connections and tribe memberships</li>
      </ul>

      <h3>1.3 AI Interactions</h3>
      <p>
        If you use the T-Codex Prime AI assistant, your messages and the assistant&rsquo;s responses
        may be transmitted to a third-party AI inference provider for processing. We do not use
        your AI conversations to train models. The AI provider is configurable by platform
        administrators and may change. See Section 5 for details.
      </p>

      <h3>1.4 Automatically Collected Data</h3>
      <ul>
        <li><strong>Session data:</strong> Session identifiers and user-agent strings for security and session management.</li>
        <li><strong>Cookies:</strong> See our <a href="/cookies">Cookie Policy</a> for details.</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li><strong>Provide the service:</strong> Display your content to other users, manage tribe memberships and bonds, facilitate events.</li>
        <li><strong>Authentication &amp; security:</strong> Verify your identity via passkeys, manage sessions, enforce platform safety.</li>
        <li><strong>Billing:</strong> Process subscriptions and payments via Stripe. We do not store your payment card details.</li>
        <li><strong>Communication:</strong> Send transactional emails (event reminders, verification), and commercial emails (only with your consent).</li>
        <li><strong>AI features:</strong> Process your messages through AI inference to provide assistant responses.</li>
        <li><strong>Moderation:</strong> Review reported content and enforce community guidelines.</li>
      </ul>

      <h2>3. Third-Party Sharing</h2>
      <p>We share data with third parties only as necessary:</p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Data Shared</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Stripe</strong></td>
            <td>Payment processing</td>
            <td>Email, subscription plan, Stripe customer ID</td>
          </tr>
          <tr>
            <td><strong>AI Inference Provider</strong></td>
            <td>AI assistant responses</td>
            <td>Conversation messages (user inputs + AI responses)</td>
          </tr>
          <tr>
            <td><strong>S3-Compatible Storage</strong></td>
            <td>File/image hosting</td>
            <td>Uploaded files (images, avatars)</td>
          </tr>
          <tr>
            <td><strong>Google OAuth</strong></td>
            <td>Authentication (optional)</td>
            <td>OAuth tokens (received from Google, not sent)</td>
          </tr>
        </tbody>
      </table>
      <p>We do not sell your personal data to third parties.</p>

      <h2>4. Data Retention</h2>
      <p>
        We retain your personal data for as long as your account is active. When you delete your
        account, we permanently remove your personal information and either delete or anonymize
        your content. Posts with replies from other users are anonymized (author set to
        &quot;Deleted User&quot;) to preserve conversation thread integrity.
      </p>

      <h2>5. AI Data Processing</h2>
      <p>
        The T-Codex Prime AI assistant processes your messages through an external AI provider. 
        Key points:
      </p>
      <ul>
        <li>Your conversation history is sent to the configured AI endpoint for each interaction.</li>
        <li>Platform administrators may change the AI provider. The current provider may be self-hosted or cloud-based.</li>
        <li>We do not use your AI conversations for model training purposes.</li>
        <li><strong>Recommendation:</strong> Do not share sensitive personal information (passwords, financial details, health data) in AI conversations.</li>
      </ul>

      <h2>6. Your Rights</h2>

      <h3>GDPR (EU/EEA Residents)</h3>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access</strong> your personal data</li>
        <li><strong>Rectify</strong> inaccurate data (via Settings → Identity &amp; Profile)</li>
        <li><strong>Erase</strong> your data (via Settings → Delete Account)</li>
        <li><strong>Object</strong> to processing</li>
        <li><strong>Data portability</strong> — request a copy of your data</li>
        <li><strong>Withdraw consent</strong> at any time</li>
      </ul>

      <h3>CCPA / CPRA (California Residents)</h3>
      <p>You have the right to:</p>
      <ul>
        <li>Know what personal information is collected</li>
        <li>Request deletion of your personal information</li>
        <li>Opt out of the sale of personal information (we do not sell your data)</li>
        <li>Non-discrimination for exercising your privacy rights</li>
      </ul>

      <h2>7. Children&rsquo;s Privacy</h2>
      <p>
        Tribes.app is not intended for children under 13 years of age. We do not knowingly collect
        personal information from children under 13. If you are a parent or guardian and believe
        your child has provided us with personal information, please contact us and we will
        delete it promptly.
      </p>

      <h2>8. Security</h2>
      <p>
        We implement industry-standard security measures including:
      </p>
      <ul>
        <li>Passwordless authentication via WebAuthn/FIDO2</li>
        <li>CSRF protection on all state-changing operations</li>
        <li>Session management with server-side revocation</li>
        <li>Rate limiting on authentication endpoints</li>
        <li>Encrypted vault backups for end-to-end encryption keys</li>
      </ul>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material
        changes by posting a notice on the platform. Your continued use after changes constitutes
        acceptance of the updated policy.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        For privacy-related questions or to exercise your rights, contact us at:
      </p>
      <p>
        <strong>Email:</strong> privacy@tribes.app<br />
        <strong>Address:</strong> 7210 78th Dr. NE, Marysville, WA 98270
      </p>
    </article>
  );
}
