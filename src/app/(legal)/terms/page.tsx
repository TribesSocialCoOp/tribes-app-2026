import type { Metadata } from 'next';
import { getLatestLegalDocument } from '@/lib/legal-content';
import { MarkdownContent } from '@/components/ui/markdown-content';

export const metadata: Metadata = {
  title: 'Terms of Service — Tribes.app',
  description: 'Terms and conditions for using the Tribes.app social networking platform.',
};

export default async function TermsOfServicePage() {
  const doc = await getLatestLegalDocument('terms');

  return (
    <article>
      <h1 className="text-2xl font-bold font-mono tracking-normal text-foreground mb-1">{doc.title}</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Version {doc.version} — Effective{' '}
        {new Date(doc.effectiveDate + 'T00:00:00').toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>
      <hr className="mb-6 border-border" />
      <MarkdownContent content={doc.content} />
    </article>
  );
}
