import { describe, it, expect } from 'vitest';
import { rowToTribePost } from '../mappers/post-mapper';

/**
 * Minimal mock post row — cast as `any` so these tests don't break
 * every time a new column is added to the posts schema.
 * We only care about the fields that rowToTribePost actually reads.
 */
function mockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-1',
    authorName: 'Jeremy Krantz',
    authorAvatar: 'avatar-url',
    authorAvatarFallback: 'JK',
    content: 'Hello world',
    createdAt: new Date(),
    tribeId: 'tribe-1',
    ring: 'tribes',
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: true,
    title: null,
    slug: null,
    imageUrl: null,
    imageUrls: null,
    imageAlt: null,
    dataAiHintAvatar: null,
    dataAiHintImage: null,
    removalReason: null,
    originalPostId: null,
    isPinned: false,
    moodTag: null,
    moodVisibility: 'public',
    pinnedToWall: false,
    isEncrypted: false,
    ciphertext: null,
    encryptionIv: null,
    linkUrl: null,
    linkTitle: null,
    linkDescription: null,
    linkImage: null,
    linkSiteName: null,
    editedAt: null,
    slugEditedBy: null,
    ...overrides,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('Alias & Name Sync Mappers', () => {
  it('correctly maps stored name when no liveName is provided', () => {
    const post = rowToTribePost(mockRow());
    expect(post.authorName).toBe('Jeremy Krantz');
    expect(post.authorAvatar).toBe('avatar-url');
    expect(post.authorIsAlias).toBe(false);
  });

  it('syncs live display name and recalculates avatar initials fallback for non-alias posts', () => {
    const post = rowToTribePost(
      mockRow(),
      undefined,
      'live-avatar-url',
      false, // isAliasPost
      'Jeremy' // liveName (changed from Jeremy Krantz)
    );

    expect(post.authorName).toBe('Jeremy');
    expect(post.authorAvatar).toBe('live-avatar-url');
    expect(post.authorAvatarFallback).toBe('J'); // Initial parsed from "Jeremy"
    expect(post.authorIsAlias).toBe(false);
  });

  it('syncs multi-word live name and computes correct initials', () => {
    const post = rowToTribePost(
      mockRow(),
      undefined,
      null,
      false,
      'Jane Doe'
    );

    expect(post.authorName).toBe('Jane Doe');
    expect(post.authorAvatarFallback).toBe('JD');
  });

  it('keeps stored name and avatar for true alias posts', () => {
    const post = rowToTribePost(
      mockRow({ authorName: 'TechGuru', authorAvatar: 'alias-avatar-url', authorAvatarFallback: 'TG' }),
      undefined,
      undefined, // live avatar skipped for alias
      true, // isAliasPost
      null // live name skipped for alias
    );

    expect(post.authorName).toBe('TechGuru');
    expect(post.authorAvatar).toBe('alias-avatar-url');
    expect(post.authorAvatarFallback).toBe('TG');
    expect(post.authorIsAlias).toBe(true);
  });

  it('falls back to stored name when liveName is null and not alias', () => {
    const post = rowToTribePost(
      mockRow(),
      undefined,
      'live-avatar',
      false,
      null // no live name available
    );

    expect(post.authorName).toBe('Jeremy Krantz'); // falls back to stored
    expect(post.authorAvatar).toBe('live-avatar');
    expect(post.authorAvatarFallback).toBe('JK'); // keeps stored fallback
  });
});
