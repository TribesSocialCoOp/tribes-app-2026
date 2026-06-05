/**
 * @fileoverview Emoji shortcode data source for the ::shortcode:: autocomplete system.
 *
 * Wraps the `gemoji` package (~1 900 Unicode entries) with a lazy singleton
 * lookup map and a two-pass search (name-prefix first, tag-prefix fallback).
 * All operations are synchronous.
 *
 * Used by:
 *  - useEmojiAutocomplete (compose-time autocomplete)
 *  - MarkdownContent (display-time ::shortcode:: to emoji rendering)
 */

import { gemoji } from "gemoji";

// ── Lookup map ─────────────────────────────────────────────────────────────────

let _map: Map<string, string> | null = null;

/** Lazy-initialise the name to emoji map on first access. */
function getMap(): Map<string, string> {
  if (!_map) {
    _map = new Map<string, string>();
    for (const entry of gemoji) {
      for (const name of entry.names) {
        _map.set(name, entry.emoji);
      }
    }
  }
  return _map;
}

/**
 * Resolve a single shortcode name to its native emoji character.
 * Returns `undefined` for unknown shortcodes so callers can fall back gracefully.
 *
 * @example resolveEmojiShortcode("joy")   // "😂"
 * @example resolveEmojiShortcode("zzzzz") // undefined
 */
export function resolveEmojiShortcode(shortcode: string): string | undefined {
  return getMap().get(shortcode);
}

// ── Search ─────────────────────────────────────────────────────────────────────

export interface EmojiSearchResult {
  shortcode: string;
  emoji: string;
}

/**
 * Prefix-search across the full gemoji dataset.
 *
 * Two-pass ranking:
 *  1. Shortcode names that start with `query` (highest relevance)
 *  2. Tag matches for queries like "happy" to `:smile:`, `:grinning:`, etc.
 *
 * De-duplicates by emoji character so the same glyph never appears twice.
 * Returns at most `limit` results (default 8).
 */
export function searchEmoji(
  query: string,
  limit = 8,
): EmojiSearchResult[] {
  if (!query) return [];

  const q = query.toLowerCase();
  const nameMatches: EmojiSearchResult[] = [];
  const tagMatches: EmojiSearchResult[] = [];
  const seen = new Set<string>();

  for (const entry of gemoji) {
    if (nameMatches.length >= limit) break;

    for (const name of entry.names) {
      if (name.startsWith(q) && !seen.has(entry.emoji)) {
        nameMatches.push({ shortcode: name, emoji: entry.emoji });
        seen.add(entry.emoji);
        break;
      }
    }
  }

  // Fill remaining slots with tag matches
  if (nameMatches.length < limit) {
    for (const entry of gemoji) {
      if (nameMatches.length + tagMatches.length >= limit) break;
      if (seen.has(entry.emoji)) continue;

      const matched = entry.tags?.some((tag) => tag.startsWith(q));
      if (matched) {
        tagMatches.push({
          shortcode: entry.names[0],
          emoji: entry.emoji,
        });
        seen.add(entry.emoji);
      }
    }
  }

  return [...nameMatches, ...tagMatches].slice(0, limit);
}
