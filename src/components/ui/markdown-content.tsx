"use client";

import React, { useEffect, useRef, useState, useId, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'isomorphic-dompurify';
import { cn } from '@/lib/utils';
import type { Ring } from '@/lib/types';
import Link from 'next/link';
import { BlurReveal, useAutoReblur } from '@/components/ui/blur-reveal';
import { resolveEmojiShortcode } from '@/lib/emoji-data';

const MAX_CHART_LENGTH = 10_000; // ~10 KB — generous for any reasonable diagram

// ── Inline image token ─────────────────────────────────────────────────────────
// Matches [img:N] where N is a 1-based image index
const IMG_REF_REGEX = /\[img:(\d+)\]/g;
const INLINE_SCHEME = 'https://tribes-inline.internal/';

/**
 * Pre-process post content: replace [img:N] tokens with markdown image syntax
 * so react-markdown can render them as `img` nodes.
 */
function preprocessInlineImages(content: string): string {
  return content.replace(IMG_REF_REGEX, '![inline-image-$1](https://tribes-inline.internal/$1)');
}

/**
 * Pre-process post content: replace @alias mentions with markdown links [alias](/u/alias)
 */
function preprocessMentions(content: string): string {
  return content.replace(/(^|\s)@([a-zA-Z0-9_-]{2,30})/g, '$1[@$2](/u/$2)');
}

/**
 * Pre-process post content: replace ::shortcode:: emoji references with the actual emoji character.
 * Uses the gemoji dataset for lookup.
 */
function preprocessEmoji(content: string): string {
  return content.replace(/::([a-z0-9_+-]+)::/g, (match, shortcode) => {
    const emoji = resolveEmojiShortcode(shortcode);
    return emoji ?? match; // Keep the original if shortcode not found
  });
}

/**
 * Extract which 1-based image indices are referenced by [img:N] tokens.
 */
export function getReferencedImageIndices(content: string): Set<number> {
  const refs = new Set<number>();
  let match;
  const re = /\[img:(\d+)\]/g;
  while ((match = re.exec(content)) !== null) {
    refs.add(parseInt(match[1], 10));
  }
  return refs;
}

// ── Mermaid Block ──────────────────────────────────────────────────────────────

function MermaidBlock({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, '_');

  useEffect(() => {
    let active = true;

    // DoS guard — reject excessively large diagram definitions
    if (chart.length > MAX_CHART_LENGTH) {
      setError('Diagram too large to render');
      return;
    }

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;

        // Detect dark mode
        const isDark = document.documentElement.classList.contains('dark');

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid_${uniqueId}`,
          chart.trim(),
        );

        // Sanitize SVG output — defense-in-depth against mermaid rendering bypasses
        const cleanSvg = DOMPurify.sanitize(renderedSvg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ['foreignObject'], // mermaid uses foreignObject for text layout
        });
        if (active) setSvg(cleanSvg);
      } catch (err) {
        console.error('[MermaidBlock] Render failed:', err);
        if (active) setError(chart);
      }
    }

    render();
    return () => { active = false; };
  }, [chart, uniqueId]);

  if (error) {
    return (
      <pre className="bg-muted/50 rounded-md p-3 overflow-x-auto text-xs mb-2">
        <code>{error}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-6 mb-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mb-3 overflow-x-auto rounded-md border bg-background p-2 [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ── MarkdownContent ────────────────────────────────────────────────────────────

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** Image URLs/fileIds from the post's imageUrls array (for [img:N] inline refs) */
  imageUrls?: string[];
  /** Whether the post is encrypted (determines EncryptedImage vs plain img) */
  isEncrypted?: boolean;
  /** Post ID — required for encrypted image decryption */
  postId?: string;
  /** Ring type — required for encrypted image decryption */
  ring?: Ring;
  /** Tribe ID — required for tribe-encrypted image decryption */
  tribeId?: string;
  /** Callback when an inline image is clicked (for lightbox) */
  onImageClick?: (imageIndex: number) => void;
  /** Blur inline images until tapped (issue #32 — NSFW media in adult tribes). */
  blurImages?: boolean;
}

/**
 * Renders markdown content with proper styling for posts and comments.
 * Supports: headings, bold/italic, links, lists, tables (GFM), code blocks,
 * mermaid diagrams, and [img:N] inline image references.
 * Sanitizes by default (react-markdown strips raw HTML).
 */
export function MarkdownContent({
  content,
  className,
  imageUrls,
  isEncrypted,
  postId,
  ring,
  tribeId,
  onImageClick,
  blurImages,
}: MarkdownContentProps) {
  // Pre-process [img:N] tokens and @mentions into markdown syntax
  const processedContent = useMemo(() => {
    let result = content;
    if (imageUrls?.length) {
      result = preprocessInlineImages(result);
    }
    result = preprocessMentions(result);
    result = preprocessEmoji(result);
    return result;
  }, [content, imageUrls?.length]);

  // Build components with image context bound in
  const components = useMemo(() => {
    return {
      ...markdownComponents,
      // Custom img renderer: handles inline image refs + regular images
      img: ({ src, alt }: any) => {
        // Check if this is an inline image reference (tribes-inline://N)
        if (src?.startsWith(INLINE_SCHEME) && imageUrls?.length) {
          const index = parseInt(src.replace(INLINE_SCHEME, ''), 10);
          const arrayIdx = index - 1; // [img:N] is 1-based
          if (arrayIdx < 0 || arrayIdx >= imageUrls.length) {
            // Out of bounds — show placeholder
            return (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                [image {index} not found]
              </span>
            );
          }
          const urlOrId = imageUrls[arrayIdx];

          if (isEncrypted && postId) {
            // Lazy-load EncryptedImage to avoid importing crypto in every post
            return (
              <InlineEncryptedImage
                fileId={urlOrId}
                postId={postId}
                ring={ring}
                tribeId={tribeId}
                alt={alt || `Image ${index}`}
                onClick={() => onImageClick?.(arrayIdx)}
                blur={blurImages}
              />
            );
          }

          return (
            <InlineImage blur={blurImages} onClick={() => onImageClick?.(arrayIdx)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlOrId}
                alt={alt || `Image ${index}`}
                className="max-w-full max-h-[500px] w-auto h-auto rounded-md border bg-muted/20 object-contain"
              />
            </InlineImage>
          );
        }

        // Regular markdown image — render normally
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || ''}
            className="max-w-full max-h-[500px] w-auto h-auto rounded-md my-2 object-contain"
          />
        );
      },
    };
  }, [imageUrls, isEncrypted, postId, ring, tribeId, onImageClick, blurImages]);

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

// ── Inline Encrypted Image (lazy wrapper) ──────────────────────────────────────

function InlineEncryptedImage({
  fileId,
  postId,
  ring,
  tribeId,
  alt,
  onClick,
  blur,
}: {
  fileId: string;
  postId: string;
  ring?: Ring;
  tribeId?: string;
  alt: string;
  onClick?: () => void;
  blur?: boolean;
}) {
  const [EncryptedImage, setEncryptedImage] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    import('@/components/ui/encrypted-image').then(mod => {
      setEncryptedImage(() => mod.EncryptedImage);
    });
  }, []);

  if (!EncryptedImage) {
    return (
      <div className="my-3 flex items-center justify-center h-32 bg-muted/20 rounded-md border animate-pulse">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <InlineImage blur={blur} onClick={onClick}>
      <EncryptedImage
        fileId={fileId}
        postId={postId}
        ring={ring}
        tribeId={tribeId}
        alt={alt}
        className="max-w-full max-h-[500px] w-auto h-auto rounded-md border bg-muted/20 object-contain"
      />
    </InlineImage>
  );
}

// ── Inline image wrapper (issue #32) ────────────────────────────────────────────
// Renders a block inline image. When `blur` is set, shows it blurred with a
// tap-to-reveal overlay (per-image). Inline images are already block-level, so the
// blur wrapper occupies the same box — it never disrupts surrounding text flow.
function InlineImage({
  blur,
  onClick,
  children,
}: {
  blur?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { revealed, reveal, ref } = useAutoReblur<HTMLSpanElement>();

  if (blur && !revealed) {
    return (
      <BlurReveal
        as="span"
        size="sm"
        className="my-3 rounded-md"
        blurClassName="blur-2xl scale-105"
        label="Tap to reveal"
        ariaLabel="Reveal adult image"
        onReveal={reveal}
      >
        {children}
      </BlurReveal>
    );
  }

  // Revealed (or non-blur) image. When it was an adult reveal, the ref lets it
  // auto-re-blur once it scrolls out of view.
  return (
    <span ref={ref} className="block my-3 cursor-pointer" onClick={onClick}>
      {children}
    </span>
  );
}

// ── Static markdown components (shared across all instances) ───────────────────

const markdownComponents = {
  // Headings — size-capped to avoid oversized renders in feed
  h1: ({ children }: any) => <h3 className="text-lg font-bold mt-4 mb-2 text-foreground">{children}</h3>,
  h2: ({ children }: any) => <h4 className="text-base font-semibold mt-3 mb-1.5 text-foreground">{children}</h4>,
  h3: ({ children }: any) => <h5 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h5>,
  // Paragraphs
  p: ({ children }: any) => <p className="text-sm text-foreground leading-relaxed mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
  // Links
  a: ({ href, children }: any) => {
    const isMention = href?.startsWith('/u/');
    if (isMention) {
      return (
        <Link
          href={href ?? '#'}
          className="inline-flex items-center font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5 text-xs hover:bg-primary/20 transition-colors no-underline"
        >
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {children}
      </a>
    );
  },
  // Lists
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-sm text-foreground">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-sm text-foreground">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm leading-relaxed">{children}</li>,
  // Bold / Italic
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  // Code (with mermaid support)
  code: ({ children, className: codeClass }: any) => {
    const isMermaid = codeClass?.includes('language-mermaid');
    if (isMermaid) {
      const chart = String(children).replace(/\n$/, '');
      return <MermaidBlock chart={chart} />;
    }
    const isBlock = codeClass?.includes('language-');
    if (isBlock) {
      return (
        <pre className="bg-muted/50 rounded-md p-3 overflow-x-auto text-xs mb-2">
          <code>{children}</code>
        </pre>
      );
    }
    return <code className="bg-muted/50 rounded px-1.5 py-0.5 text-xs font-mono">{children}</code>;
  },
  pre: ({ children }: any) => <>{children}</>,
  // Tables (GFM)
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-3 rounded-md border">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-muted/50 border-b">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }: any) => <tr>{children}</tr>,
  th: ({ children }: any) => <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
  td: ({ children }: any) => <td className="px-3 py-2 text-muted-foreground">{children}</td>,
  // Horizontal rule
  hr: () => <hr className="my-3 border-border" />,
  // Blockquote
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground mb-2">
      {children}
    </blockquote>
  ),
};

