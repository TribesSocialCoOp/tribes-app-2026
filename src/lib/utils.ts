import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns a human-readable relative time string (e.g. "5m ago", "2h ago").
 * Previously duplicated in: moods/[moodSlug], tribes/[tribeId], your-comms, event/stream.
 */
export function timeSince(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  let interval = Math.floor(seconds / 60);
  if (interval < 60) return `${interval}m ago`;
  interval = Math.floor(seconds / 3600);
  if (interval < 24) return `${interval}h ago`;
  interval = Math.floor(seconds / 86400);
  if (interval < 7) return `${interval}d ago`;
  if (interval < 30) return `${Math.floor(interval / 7)}w ago`;
  interval = Math.floor(seconds / 2592000);
  if (interval < 12) return `${interval}mo ago`;
  interval = Math.floor(seconds / 31536000);
  return `${interval}y ago`;
}

/**
 * Formats a Date to a locale-aware short date string.
 * Safely handles invalid/null dates.
 * Previously duplicated in: bond-table-row.
 */
export function formatDate(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString();
}

/**
 * Safely cleans a URL extracted from formatted markdown or text,
 * stripping trailing formatting, punctuation, and unmatched parentheses/brackets/braces.
 */
export function cleanUrl(rawUrl: string): string {
  let url = rawUrl;

  while (true) {
    const lastChar = url.slice(-1);
    if (!lastChar) break;

    // Trim trailing formatting or punctuation characters that shouldn't end a URL
    if (['*', '_', '~', '`', '"', "'", '.', ',', ';', ':', '!', '?'].includes(lastChar)) {
      url = url.slice(0, -1);
      continue;
    }

    // Handle closing parentheses - strip if unmatched
    if (lastChar === ')') {
      const openCount = (url.match(/\(/g) || []).length;
      const closeCount = (url.match(/\)/g) || []).length;
      if (closeCount > openCount) {
        url = url.slice(0, -1);
        continue;
      }
    }

    // Handle closing square brackets - strip if unmatched
    if (lastChar === ']') {
      const openCount = (url.match(/\[/g) || []).length;
      const closeCount = (url.match(/\]/g) || []).length;
      if (closeCount > openCount) {
        url = url.slice(0, -1);
        continue;
      }
    }

    // Handle closing curly braces - strip if unmatched
    if (lastChar === '}') {
      const openCount = (url.match(/\{/g) || []).length;
      const closeCount = (url.match(/\}/g) || []).length;
      if (closeCount > openCount) {
        url = url.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return url;
}

interface HasReplies {
  replies?: HasReplies[];
}

/**
 * Recursively counts all comments in a threaded tree.
 */
export function countAllComments(comments: HasReplies[]): number {
  return comments.reduce((sum, c) => sum + 1 + countAllComments(c.replies ?? []), 0);
}

interface ThreadedComment {
  id: string;
  parentCommentId?: string | null;
  replies?: ThreadedComment[];
}

/**
 * Recursively inserts a new reply into a threaded comment tree.
 */
export function insertReplyIntoTree<T extends ThreadedComment>(comments: T[], reply: T): T[] {
  return comments.map(c => {
    if (c.id === reply.parentCommentId) {
      return {
        ...c,
        replies: [...(c.replies ?? []), reply],
      } as T;
    }
    if (c.replies && c.replies.length > 0) {
      return {
        ...c,
        replies: insertReplyIntoTree(c.replies as T[], reply),
      } as T;
    }
    return c;
  });
}

