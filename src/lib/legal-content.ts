import fs from 'fs';
import path from 'path';

export interface LegalDocument {
  title: string;
  version: string;
  effectiveDate: string;
  content: string;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns the frontmatter fields and the remaining markdown body.
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    // Strip surrounding quotes from the value
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = value;
  }

  return { meta, body: match[2] };
}

/**
 * Get the latest version of a legal document by reading versioned markdown
 * files from `src/content/legal/<docType>/`.
 *
 * Files are expected to be named `v<semver>.md` (e.g., `v1.0.0.md`).
 * The "latest" is determined by reverse-lexicographic sort of filenames.
 *
 * This function runs at build time / SSR — it uses Node `fs` and must only
 * be called from Server Components or server-side code.
 */
export async function getLatestLegalDocument(docType: string): Promise<LegalDocument> {
  const contentDir = path.join(process.cwd(), 'src', 'content', 'legal', docType);

  const files = fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse(); // latest version first

  if (files.length === 0) {
    throw new Error(`No legal document files found for "${docType}" in ${contentDir}`);
  }

  const latestFile = files[0];
  const raw = fs.readFileSync(path.join(contentDir, latestFile), 'utf-8');
  const { meta, body } = parseFrontmatter(raw);

  return {
    title: meta.title || docType,
    version: meta.version || '0.0.0',
    effectiveDate: meta.effectiveDate || 'Unknown',
    content: body.trim(),
  };
}

/**
 * List all available versions for a given legal document type.
 * Returns them in reverse chronological order (latest first).
 */
export async function listLegalDocumentVersions(
  docType: string
): Promise<Array<{ version: string; effectiveDate: string; filename: string }>> {
  const contentDir = path.join(process.cwd(), 'src', 'content', 'legal', docType);

  const files = fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  return files.map((filename) => {
    const raw = fs.readFileSync(path.join(contentDir, filename), 'utf-8');
    const { meta } = parseFrontmatter(raw);
    return {
      version: meta.version || '0.0.0',
      effectiveDate: meta.effectiveDate || 'Unknown',
      filename,
    };
  });
}
