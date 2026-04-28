"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with proper styling for posts and comments.
 * Supports: headings, bold/italic, links, lists, tables (GFM), code blocks.
 * Sanitizes by default (react-markdown strips raw HTML).
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings — size-capped to avoid oversized renders in feed
          h1: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-2 text-foreground">{children}</h3>,
          h2: ({ children }) => <h4 className="text-base font-semibold mt-3 mb-1.5 text-foreground">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h5>,
          // Paragraphs
          p: ({ children }) => <p className="text-sm text-foreground leading-relaxed mb-2 last:mb-0">{children}</p>,
          // Links
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
          // Lists
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-sm text-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-sm text-foreground">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
          // Bold / Italic
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          // Code
          code: ({ children, className: codeClass }) => {
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
          pre: ({ children }) => <>{children}</>,
          // Tables (GFM)
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3 rounded-md border">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/50 border-b">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-muted-foreground">{children}</td>,
          // Horizontal rule
          hr: () => <hr className="my-3 border-border" />,
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground mb-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
