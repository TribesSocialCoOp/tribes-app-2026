import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy — Tribes.app',
  description: 'How Tribes.app uses cookies and similar technologies.',
};

export default function CookiePolicyPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>Cookie Policy</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <p>
        This Cookie Policy explains how Tribes.app uses cookies and similar technologies
        to recognize you when you visit our platform.
      </p>

      <h2>1. What Are Cookies?</h2>
      <p>
        Cookies are small text files stored on your device by your web browser. They are
        widely used to make websites work efficiently and to provide information to the
        operators of the site.
      </p>

      <h2>2. Cookies We Use</h2>
      <p>
        Tribes.app uses only <strong>strictly necessary cookies</strong> — we do not use
        advertising cookies, tracking pixels, or third-party analytics tools.
      </p>

      <table>
        <thead>
          <tr>
            <th>Cookie Name</th>
            <th>Purpose</th>
            <th>Type</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>tribes_session</code></td>
            <td>Authenticates your session and keeps you logged in</td>
            <td>Essential</td>
            <td>30 days</td>
          </tr>
          <tr>
            <td><code>__tribes_csrf</code></td>
            <td>Cross-Site Request Forgery (CSRF) protection token</td>
            <td>Essential (Security)</td>
            <td>Session</td>
          </tr>
          <tr>
            <td><code>webauthn_challenge</code></td>
            <td>Temporary challenge for passkey authentication flows</td>
            <td>Essential (Security)</td>
            <td>5 minutes</td>
          </tr>
          <tr>
            <td><code>sidebar:state</code></td>
            <td>Remembers your sidebar open/collapsed preference</td>
            <td>Functional</td>
            <td>7 days</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Third-Party Cookies</h2>
      <p>
        Tribes.app does <strong>not</strong> set or allow third-party advertising or analytics
        cookies. However, if you interact with third-party content embedded in posts (e.g.,
        YouTube videos, external links), those third parties may set their own cookies subject
        to their own policies.
      </p>

      <h2>4. Cookie-Free Alternatives</h2>
      <p>
        Since all cookies we use are strictly necessary for security and functionality,
        disabling them may prevent you from using Tribes.app. The platform requires the
        session cookie to authenticate you and the CSRF cookie to protect against
        cross-site request forgery attacks.
      </p>

      <h2>5. Managing Cookies</h2>
      <p>
        You can manage cookies through your browser settings. Most browsers allow you to:
      </p>
      <ul>
        <li>View what cookies are currently set</li>
        <li>Delete cookies individually or in bulk</li>
        <li>Block cookies from specific sites</li>
        <li>Block all cookies (note: this will prevent Tribes.app from functioning)</li>
      </ul>
      <p>
        For instructions on managing cookies in your browser, visit:
      </p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a></li>
        <li><a href="https://support.mozilla.org/en-US/kb/delete-cookies-remove-info-websites-stored" target="_blank" rel="noopener noreferrer">Firefox</a></li>
        <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
        <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Edge</a></li>
      </ul>

      <h2>6. Updates to This Policy</h2>
      <p>
        If we introduce new cookies beyond those listed above, we will update this policy and
        notify you. We will not introduce non-essential cookies (tracking, advertising) without
        obtaining your consent first, in compliance with applicable privacy laws.
      </p>

      <h2>7. Contact Us</h2>
      <p>
        For questions about our cookie practices, contact us at:
      </p>
      <p>
        <strong>Email:</strong> privacy@tribes.app
      </p>
    </article>
  );
}
