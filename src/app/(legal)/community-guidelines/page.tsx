import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community Guidelines — Tribes.app',
  description: 'Content standards, moderation policies, and community expectations for Tribes.app.',
};

export default function CommunityGuidelinesPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>Community Guidelines</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <p>
        Tribes.app is a community-driven social platform built on mutual respect, authentic
        connection, and cooperative governance. These guidelines help maintain a safe, welcoming
        environment for everyone.
      </p>

      <h2>1. Core Principles</h2>
      <ul>
        <li><strong>Authenticity:</strong> Be yourself. Represent yourself honestly and engage in good faith.</li>
        <li><strong>Respect:</strong> Treat all community members with dignity, even in disagreement.</li>
        <li><strong>Safety:</strong> Protect yourself and others from harm. Report dangerous content.</li>
        <li><strong>Cooperation:</strong> Contribute positively to your tribes and the broader community.</li>
      </ul>

      <h2>2. Prohibited Content</h2>
      <p>The following content is strictly prohibited and may result in immediate account suspension:</p>

      <h3>2.1 Illegal Content</h3>
      <ul>
        <li><strong>Child Sexual Abuse Material (CSAM):</strong> Any content depicting the sexual exploitation of minors. This is reported to NCMEC (National Center for Missing &amp; Exploited Children) and law enforcement. <em>Zero tolerance — immediate permanent ban.</em></li>
        <li><strong>Terrorism &amp; violent extremism:</strong> Content that promotes, glorifies, or supports terrorism or terrorist organizations.</li>
        <li><strong>Illegal transactions:</strong> Solicitation of illegal goods or services.</li>
      </ul>

      <h3>2.2 Harassment &amp; Abuse</h3>
      <ul>
        <li><strong>Targeted harassment:</strong> Repeated, unwanted contact or systematic campaigns against individuals.</li>
        <li><strong>Hate speech:</strong> Content that attacks, demeans, or dehumanizes individuals or groups based on race, ethnicity, national origin, religion, gender, gender identity, sexual orientation, disability, or immigration status.</li>
        <li><strong>Doxxing:</strong> Sharing someone&rsquo;s private personal information (address, phone number, workplace) without their consent.</li>
        <li><strong>Threats of violence:</strong> Credible threats of physical harm to any person or group.</li>
        <li><strong>Sexual harassment:</strong> Unwanted sexual content directed at an individual.</li>
      </ul>

      <h3>2.3 Harmful Behavior</h3>
      <ul>
        <li><strong>Self-harm promotion:</strong> Content that promotes, glorifies, or provides instructions for self-harm or suicide.</li>
        <li><strong>Non-consensual intimate imagery (NCII):</strong> Sharing intimate images or videos of a person without their consent ("revenge porn"), including digitally altered or AI-generated synthetic depictions ("deepfakes"). We maintain a zero-tolerance policy. If you or someone you represent is depicted, submit an urgent request through our secure <a href="/report-ncii">NCII Reporting Portal</a>.</li>
        <li><strong>Misinformation:</strong> Deliberately spreading false information that could cause significant real-world harm (e.g., dangerous health misinformation).</li>
      </ul>

      <h3>2.4 Platform Abuse</h3>
      <ul>
        <li><strong>Spam:</strong> Unsolicited bulk messaging, repetitive posts, or automated account activity.</li>
        <li><strong>Impersonation:</strong> Pretending to be another person, brand, or organization in a deceptive way.</li>
        <li><strong>Manipulation:</strong> Gaming the contribution system, coordinated inauthentic behavior, or vote manipulation.</li>
        <li><strong>Copyright infringement:</strong> Posting content you do not own or have the right to share. See our DMCA process in the <a href="/terms">Terms of Service</a>.</li>
      </ul>

      <h2>3. Content Guidelines</h2>

      <h3>3.1 Sensitive Content</h3>
      <p>
        The following content is allowed but must be appropriately contextualized and may be
        subject to content warnings or restricted distribution:
      </p>
      <ul>
        <li>Graphic violence in newsworthy or educational contexts</li>
        <li>Discussions of sensitive topics (mental health, substance abuse, trauma) in supportive contexts</li>
        <li>Artistic nudity or mature themes (must comply with tribe-specific rules)</li>
      </ul>

      <h3>3.2 Tribes and Self-Governance</h3>
      <p>
        Tribes may establish additional content rules beyond these platform-wide guidelines.
        Tribe speakers (moderators) are empowered to enforce tribe-specific standards. However:
      </p>
      <ul>
        <li>Tribe rules may not contradict these Community Guidelines</li>
        <li>Tribe moderators may not use their powers for personal harassment or retaliation</li>
        <li>Platform administrators can intervene in any tribe for safety reasons</li>
      </ul>

      <h2>4. Enforcement</h2>

      <h3>4.1 Moderation Actions</h3>
      <p>Depending on severity, we may take the following actions:</p>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Description</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Content Removal</strong></td>
            <td>Offending content is removed</td>
            <td>Permanent</td>
          </tr>
          <tr>
            <td><strong>Warning</strong></td>
            <td>Formal notice of policy violation</td>
            <td>N/A</td>
          </tr>
          <tr>
            <td><strong>Temporary Suspension</strong></td>
            <td>Account restricted for a defined period</td>
            <td>1 day – 30 days</td>
          </tr>
          <tr>
            <td><strong>Permanent Ban</strong></td>
            <td>Account permanently disabled, all sessions revoked</td>
            <td>Permanent</td>
          </tr>
        </tbody>
      </table>

      <h3>4.2 Appeals</h3>
      <p>
        If you believe a moderation action was taken in error, you may appeal by contacting
        our moderation team at <strong>appeals@tribes.app</strong>. Appeals are reviewed by
        a staff member who was not involved in the original decision. We aim to respond to
        appeals within 5 business days.
      </p>

      <h2>5. Reporting &amp; Safety Compliance</h2>
      <p>
        If you see content or behavior that violates these guidelines, please report it using
        the in-app reporting feature (available on all posts and user profiles). Reports are
        reviewed by our moderation team. For urgent safety concerns (imminent threats, CSAM),
        contact <strong>safety@tribes.app</strong> directly.
      </p>
      <p>
        <strong>Non-Consensual Intimate Imagery (NCII) / Take It Down Act Compliance:</strong>
        If you or someone you represent has had intimate content (including authentic or AI-generated/deepfake imagery) shared on Tribes without consent, please file an expedited report via our secure <a href="/report-ncii" className="text-red-500 font-semibold hover:underline">NCII Reporting Portal</a>.
      </p>
      <p>
        In compliance with federal obligations, we pledge a strict <strong className="text-foreground font-semibold">48-hour evaluation and removal SLA</strong> for NCII reports. Verified content will be immediately taken down, and its perceptual hash (PDQ) will be added to our secure database to block future upload attempts globally.
      </p>
      <p>
        All reports are confidential. We do not disclose the identity of reporters to the
        reported user.
      </p>

      <h2>6. Transparency</h2>
      <p>
        We are committed to transparency in our moderation practices. We will publish periodic
        transparency reports covering:
      </p>
      <ul>
        <li>Volume of reports received and actioned</li>
        <li>Types of content removed</li>
        <li>Number of accounts suspended or banned</li>
        <li>Government requests for data</li>
      </ul>

      <h2>7. Changes to These Guidelines</h2>
      <p>
        We may update these Community Guidelines from time to time. Material changes will be
        announced on the platform. Continued use of Tribes.app after changes constitutes
        acceptance of the updated guidelines.
      </p>
    </article>
  );
}
