/**
 * Seed script — transforms mock data from data.ts into SQLite rows.
 * Run with: npx tsx src/db/seed.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './index';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

// ---- Import seed fixtures ----
import {
  tribesData,
  mockUserProfile,
  MOCK_CURRENT_USER_ID,
  sampleEventsData,
  initialSampleTribePosts,
  allMoodStreamPosts,
  mockReportedContentData,
  bondsData,
  mockMembers,
  mockPendingMembers,
  mockStoryTopics,
  mockArticlesForStory,
  mockCommentsForStory,
  mockEventStreamPosts,
} from '../../scripts/fixtures/seed-data';

async function seed() {
  console.log('🌱 Seeding database...');

  // Disable FK constraints for clean wipe
  await db.run(sql`PRAGMA foreign_keys = OFF`);

  // Clear all tables (reverse dependency order)
  await db.delete(schema.messages).run();
  await db.delete(schema.eventStreamPosts).run();
  await db.delete(schema.storyComments).run();
  await db.delete(schema.storyArticles).run();
  await db.delete(schema.stories).run();
  await db.delete(schema.userPreferences).run();
  await db.delete(schema.wallStyles).run();
  await db.delete(schema.wallBlocks).run();
  await db.delete(schema.reports).run();
  await db.delete(schema.vibes).run();
  await db.delete(schema.comments).run();
  await db.delete(schema.postMoodTags).run();
  await db.delete(schema.posts).run();
  await db.delete(schema.pendingMembers).run();
  await db.delete(schema.tribeMembers).run();
  await db.delete(schema.tribeMoodTags).run();
  await db.delete(schema.tribes).run();
  await db.delete(schema.contributions).run();
  await db.delete(schema.inviteRedemptions).run();
  await db.delete(schema.inviteCodes).run();
  await db.delete(schema.subscriptions).run();
  await db.delete(schema.plans).run();
  await db.delete(schema.blockedUsers).run();
  await db.delete(schema.bonds).run();
  await db.delete(schema.bondRequests).run();
  await db.delete(schema.sessions).run();
  await db.delete(schema.credentials).run();
  await db.delete(schema.userAliases).run();
  await db.delete(schema.events).run();
  await db.delete(schema.pushSubscriptions).run();
  await db.delete(schema.emailVerificationTokens).run();
  await db.delete(schema.users).run();

  // Re-enable FK constraints
  await db.run(sql`PRAGMA foreign_keys = ON`);

  // ---- 1. Users ----
  console.log('  👤 Users...');
  // Create the mock user
  db.insert(schema.users).values({
    id: mockUserProfile.id,
    name: mockUserProfile.name,
    email: mockUserProfile.email,
    role: mockUserProfile.role,
    bio: mockUserProfile.bio,
    avatar: mockUserProfile.avatar,
    reservedAlias: mockUserProfile.reservedAlias,
    reputationScore: mockUserProfile.reputationScore,
    reputationStatus: mockUserProfile.reputationStatus,
    createdAt: mockUserProfile.accountCreatedAt,
  }).run();
  // @ts-ignore -- awaited by async wrapper

  // Create aliases for mock user
  for (const alias of mockUserProfile.aliases) {
    db.insert(schema.userAliases).values({
      id: `alias-${alias}`,
      userId: mockUserProfile.id,
      alias,
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // Create users referenced in mock data
  const syntheticUsers = [
    { id: 'test-service-admin', name: 'Test Service Admin', role: 'Admin' },
    { id: 'test-service-member', name: 'TSM', role: 'Human_Member' },
    { id: 'test-speaker-user', name: 'Speaker Sam', role: 'Human_Member' },
    { id: 'test-free-user', name: 'Free Explorer', role: 'Human_Free' },
    { id: 'system', name: 'T-Codex Prime', role: 'Bot' },
    { id: 'authorXY', name: 'AI Ethicist', role: 'Human_Member' },
    { id: 'authorTB', name: 'Trail Blazer', role: 'Human_Member' },
    { id: 'authorLF', name: 'LocalFoodie', role: 'Human_Member' },
    { id: 'authorGG', name: 'GigGoer', role: 'Human_Member' },
    { id: 'authorRD', name: 'RockstarDev', role: 'Human_Member' },
    { id: 'authorDQ', name: 'DevQuest', role: 'Human_Member' },
    { id: 'user123', name: 'Event Creator 1', role: 'Creator' },
    { id: 'user456', name: 'Event Creator 2', role: 'Creator' },
    { id: 'user789', name: 'Event Creator 3', role: 'Creator' },
    { id: 'userA', name: 'GreenThumb', role: 'Human_Member' },
    { id: 'userB', name: 'CityDweller', role: 'Human_Member' },
    { id: 'userC', name: 'PolicyWonk', role: 'Human_Member' },
    // Members
    { id: 'user1', name: 'Alice Wonderland', role: 'Human_Member' },
    { id: 'user2', name: 'Bob The Builder', role: 'Human_Member' },
    { id: 'user3', name: 'Charlie Chaplin', role: 'Human_Member' },
    { id: 'user4', name: 'Diana Prince', role: 'Human_Member' },
    { id: 'user5', name: 'Edward Elric', role: 'Human_Member' },
    { id: 'user6', name: 'Fiona Glenanne', role: 'Human_Member' },
    { id: 'pending1', name: 'Frank Frankenstein', role: 'Human_Free' },
    { id: 'pending2', name: 'Grace Hopper', role: 'Human_Free' },
  ];

  for (const u of syntheticUsers) {
    db.insert(schema.users).values({
      id: u.id,
      name: u.name,
      role: u.role,
      reputationStatus: 'Active',
      createdAt: new Date(),
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 1b. Plans (Phase 3) ----
  console.log('  💳 Plans...');
  const planRows = [
    { id: 'free', name: 'Always Free', description: 'Basic access for community participation and secure communication.', priceMonthly: null, priceYearly: null, maxBonds: 10, maxTribesOwned: 0, targetRole: 'Human_Free', sortOrder: 0, stripePriceIdMonthly: null, stripePriceIdYearly: null, features: JSON.stringify(['basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption']) },
    { id: 'individual_coop', name: 'Individual Co-Op Member', description: 'For active creators and leaders who want to support and govern the community.', priceMonthly: 700, priceYearly: 7000, maxBonds: null, maxTribesOwned: 5, targetRole: 'Human_Paid', sortOrder: 1, stripePriceIdMonthly: 'price_1TH7EdEXBN16ztITClMg6JTF', stripePriceIdYearly: 'price_1TH7EmEXBN16ztITwyZqXk0v', features: JSON.stringify(['basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption', 'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting', 'create_tribes', 'host_events', 'early_access']) },
    { id: 'org_base', name: 'Organization Base', description: 'For small creators, vendors, and organizations ready to build.', priceMonthly: 2900, priceYearly: 29000, maxBonds: 500, maxTribesOwned: 10, targetRole: 'Org_Base', sortOrder: 2, stripePriceIdMonthly: 'price_1TH7F6EXBN16ztIT6PU12axd', stripePriceIdYearly: 'price_1TH7F6EXBN16ztIT7sAdFm3B', features: JSON.stringify(['basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption', 'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting', 'create_tribes', 'host_events', 'early_access', 'org_branding', 'verified_profile', 'commerce_5pct']) },
    { id: 'org_pro', name: 'Organization Pro', description: 'For growing organizations that need more scale and insight.', priceMonthly: 7900, priceYearly: 79000, maxBonds: 2000, maxTribesOwned: 50, targetRole: 'Org_Pro', sortOrder: 3, stripePriceIdMonthly: 'price_1TH7FREXBN16ztIT9aW331np', stripePriceIdYearly: 'price_1TH7FREXBN16ztIT0maLVoYV', features: JSON.stringify(['basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption', 'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting', 'create_tribes', 'host_events', 'early_access', 'org_branding', 'verified_profile', 'commerce_5pct', 'analytics', 'priority_support']) },
    { id: 'org_enterprise', name: 'Enterprise', description: 'For large-scale operations with custom needs.', priceMonthly: null, priceYearly: null, maxBonds: null, maxTribesOwned: null, targetRole: 'Org_Enterprise', sortOrder: 4, stripePriceIdMonthly: null, stripePriceIdYearly: null, features: JSON.stringify(['basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption', 'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting', 'create_tribes', 'host_events', 'early_access', 'org_branding', 'verified_profile', 'commerce_negotiable', 'analytics', 'priority_support', 'sla', 'dedicated_support', 'api_access']) },
  ];
  for (const plan of planRows) {
    db.insert(schema.plans).values(plan).run();
  }

  // ---- 1c. Founding Invite Codes ----
  console.log('  🎫 Invite Codes...');
  const foundingCodes = [
    { id: 'FOUNDING-ALPHA-001', grantsPlanId: 'individual_coop', maxUses: 50, usedCount: 0 },
    { id: 'FOUNDING-BETA-001', grantsPlanId: 'individual_coop', maxUses: 100, usedCount: 0 },
  ];
  for (const code of foundingCodes) {
    db.insert(schema.inviteCodes).values(code).run();
  }

  // ---- 1d. Sample Subscription (Founding Member) ----
  console.log('  🎖️  Founding Subscription...');
  db.insert(schema.subscriptions).values({
    id: 'sub-tsm-founding',
    userId: 'test-service-member',
    planId: 'individual_coop',
    status: 'active',
    source: 'founding',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();
  // Mark TSM as Human_Paid (founding upgrade)
  db.update(schema.users).set({ role: 'Human_Paid' }).where(
    sql`${schema.users.id} = 'test-service-member'`
  ).run();
  // Record the TSM redemption
  db.insert(schema.inviteRedemptions).values({
    id: 'redemption-tsm-founding',
    inviteCodeId: 'FOUNDING-ALPHA-001',
    userId: 'test-service-member',
  }).run();
  // Increment the used count
  db.update(schema.inviteCodes).set({ usedCount: 1 }).where(
    sql`${schema.inviteCodes.id} = 'FOUNDING-ALPHA-001'`
  ).run();

  // ---- 1e. Sample Contributions (Earn-Path Progress) ----
  console.log('  📈 Contributions...');
  const sampleContribs = [
    // Alice Wonderland — active contributor, approaching threshold (80 pts)
    { id: 'contrib-user1-001', userId: 'user1', type: 'post', points: 5, description: 'Created discussion on eco-communities' },
    { id: 'contrib-user1-002', userId: 'user1', type: 'post', points: 5, description: 'Shared recipe in HomeHarvest' },
    { id: 'contrib-user1-003', userId: 'user1', type: 'moderation', points: 10, description: 'Reported spam content' },
    { id: 'contrib-user1-004', userId: 'user1', type: 'referral', points: 25, description: 'Referred Bob The Builder' },
    { id: 'contrib-user1-005', userId: 'user1', type: 'event_hosted', points: 15, description: 'Hosted community garden meetup' },
    { id: 'contrib-user1-006', userId: 'user1', type: 'post', points: 5, description: 'Weekly tips column' },
    { id: 'contrib-user1-007', userId: 'user1', type: 'bug_report', points: 10, description: 'Found event timezone bug' },
    { id: 'contrib-user1-008', userId: 'user1', type: 'post', points: 5, description: 'Created poll about new features' },
    // Bob The Builder — casual contributor (20 pts)
    { id: 'contrib-user2-001', userId: 'user2', type: 'post', points: 5, description: 'First post in builders tribe' },
    { id: 'contrib-user2-002', userId: 'user2', type: 'post', points: 5, description: 'Shared project update' },
    { id: 'contrib-user2-003', userId: 'user2', type: 'moderation', points: 10, description: 'Flagged inappropriate content' },
    // GreenThumb — new contributor (5 pts)
    { id: 'contrib-userA-001', userId: 'userA', type: 'post', points: 5, description: 'Introductory garden post' },
    // TSM — founding member who also contributes (35 pts)
    { id: 'contrib-tsm-001', userId: 'test-service-member', type: 'tribe_created', points: 10, description: 'Created HomeHarvest tribe' },
    { id: 'contrib-tsm-002', userId: 'test-service-member', type: 'post', points: 5, description: 'Welcome post in HomeHarvest' },
    { id: 'contrib-tsm-003', userId: 'test-service-member', type: 'event_hosted', points: 15, description: 'Hosted launch meetup' },
    { id: 'contrib-tsm-004', userId: 'test-service-member', type: 'post', points: 5, description: 'Community guidelines post' },
    // Free Explorer — on the earn-path (15 pts)
    { id: 'contrib-free-001', userId: 'test-free-user', type: 'post', points: 5, description: 'First post in community' },
    { id: 'contrib-free-002', userId: 'test-free-user', type: 'post', points: 5, description: 'Shared a recipe' },
    { id: 'contrib-free-003', userId: 'test-free-user', type: 'moderation', points: 10, description: 'Reported spam account' },
  ];
  for (const contrib of sampleContribs) {
    db.insert(schema.contributions).values(contrib).run();
  }

  // ---- 1f. User-Generated Invite Code (Referral Test) ----
  console.log('  🔗 User invite code...');
  db.insert(schema.inviteCodes).values({
    id: 'INVITE-TSM-TEST',
    createdBy: 'test-service-member',
    grantsPlanId: 'individual_coop',
    maxUses: 5,
    usedCount: 0,
  }).run();

  // ---- 2. Tribes ----
  console.log('  🏛️  Tribes...');
  for (const tribe of tribesData) {
    db.insert(schema.tribes).values({
      id: tribe.id,
      name: tribe.name,
      description: tribe.description,
      memberCount: tribe.members,
      isPublic: tribe.isPublic,
      cover: tribe.cover,
      dataAiHint: tribe.dataAiHint,
      homepageUrl: tribe.homepageUrl,
      joinMechanism: tribe.joinMechanism,
      minimumReputation: tribe.minimumReputation,
      minimumAccountAgeDays: tribe.minimumAccountAgeDays,
      createdAt: new Date(),
    }).run();
  // @ts-ignore -- awaited by async wrapper

    // Tribe mood tags
    if (tribe.moods) {
      for (const mood of tribe.moods) {
        db.insert(schema.tribeMoodTags).values({
          tribeId: tribe.id,
          moodSlug: mood,
        }).run();
  // @ts-ignore -- awaited by async wrapper
      }
    }
  }

  // ---- 3. Tribe Members ----
  console.log('  👥 Tribe Members...');
  for (const member of mockMembers) {
    db.insert(schema.tribeMembers).values({
      id: `tm-${member.id}-${member.tribeId}`,
      tribeId: member.tribeId,
      userId: member.id,
      role: member.role,
      tribeAssignedNickname: member.tribeAssignedNickname,
      reputationStatus: member.reputationStatus,
      joinedAt: new Date(),
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 4. Pending Members ----
  console.log('  ⏳ Pending Members...');
  for (const pm of mockPendingMembers) {
    db.insert(schema.pendingMembers).values({
      id: pm.id,
      tribeId: pm.tribeId,
      userId: pm.id, // Using pm.id as both since these are synthetic users
      requestedAt: pm.requestTimestamp,
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 5. Bonds ----
  console.log('  🔗 Bonds...');
  for (const bond of bondsData) {
    db.insert(schema.bonds).values({
      id: bond.id,
      userId: MOCK_CURRENT_USER_ID,
      targetId: `target-${bond.id}`,
      targetType: bond.targetType,
      targetName: bond.targetName,
      bondType: bond.bondType,
      formationMethod: bond.formationMethod,
      passkeyStatus: bond.passkeyStatus,
      expiresAt: bond.expiresAt,
      lastRefreshedAt: bond.lastRefreshedAt,
      reconnectsCount: bond.reconnectsCount,
      pseudonym: bond.pseudonym,
      targetPseudonymForMe: bond.targetPseudonymForMe,
      tribeAssignedNickname: bond.tribeAssignedNickname,
      displayPreference: bond.displayPreferenceForTribeNickname,
      nicknameVibe: bond.tribeNicknameVibe,
      isNicknameReported: bond.isTribeNicknameReported,
      showInIntercom: bond.showInIntercom,
      allowChatInitiation: bond.allowChatInitiation,
      keyType: bond.keyType,
      eventId: bond.eventId,
      accessTier: bond.accessTier,
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 6. Posts (Tribe Posts) ----
  console.log('  📝 Posts...');
  for (const post of initialSampleTribePosts) {
    db.insert(schema.posts).values({
      id: post.id,
      tribeId: post.tribeId,
      authorId: post.authorId,
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      authorAvatarFallback: post.authorAvatarFallback,
      title: post.title,
      content: post.content,
      imageUrl: post.imageUrl,
      imageAlt: post.imageAlt,
      dataAiHintAvatar: post.dataAiHintAvatar,
      dataAiHintImage: post.dataAiHintImage,
      vibeCount: post.vibes ?? 0,
      commentCount: post.comments ?? 0,
      isRemoved: post.isRemoved ?? false,
      canBeReposted: post.canBeReposted ?? true,
      removalReason: post.removalReason,
      originalPostId: post.originalPostId,
      isPinned: post.isPinned ?? false,
      createdAt: post.timestamp,
    }).run();
  // @ts-ignore -- awaited by async wrapper

    // Insert comments for this post
    if (post.commentsData) {
      const insertComment = (comment: typeof post.commentsData[0], parentId: string | null) => {
        db.insert(schema.comments).values({
          id: comment.id,
          postId: post.id,
          parentCommentId: parentId,
          authorId: comment.authorId,
          authorName: comment.authorName,
          authorAvatar: comment.authorAvatar,
          authorAvatarFallback: comment.authorAvatarFallback,
          dataAiHintAvatar: comment.dataAiHintAvatar,
          content: comment.content,
          vibeCount: comment.vibes ?? 0,
          createdAt: comment.timestamp,
        }).run();
  // @ts-ignore -- awaited by async wrapper
        if (comment.replies) {
          for (const reply of comment.replies) {
            insertComment(reply, comment.id);
          }
        }
      };
      for (const comment of post.commentsData) {
        insertComment(comment, null);
      }
    }
  }

  // ---- 7. Mood Stream Posts (as post_mood_tags) ----
  console.log('  🎭 Mood Stream Tags...');
  for (const msp of allMoodStreamPosts) {
    // Check if this post already exists as a tribe post
    const existingPost = initialSampleTribePosts.find(p => p.id === msp.id);

    if (!existingPost) {
      // Find the tribe ID from the tribe name
      const tribe = tribesData.find(t => t.name === msp.tribeName);
      const tribeId = tribe?.id || '0'; // Default to "The Trials"

      // Create a post for mood-only items
      db.insert(schema.posts).values({
        id: msp.id,
        tribeId,
        authorId: MOCK_CURRENT_USER_ID, // Default author
        authorName: msp.author,
        authorAvatar: msp.authorAvatarSrc,
        authorAvatarFallback: msp.authorAvatarFallback || msp.author.substring(0, 2),
        title: msp.title,
        content: msp.content,
        imageUrl: msp.imageUrl,
        imageAlt: msp.imageAlt,
        dataAiHintAvatar: msp.dataAiHintAvatar,
        dataAiHintImage: msp.dataAiHintImage,
        vibeCount: msp.vibes ?? 0,
        commentCount: msp.comments ?? 0,
        createdAt: msp.timestamp,
      }).run();
  // @ts-ignore -- awaited by async wrapper
    }

    // Create mood tags
    for (const tag of msp.moodTags) {
      try {
        db.insert(schema.postMoodTags).values({
          postId: msp.id,
          moodSlug: tag,
          promotedAt: msp.timestamp,
          promotedBy: MOCK_CURRENT_USER_ID,
        }).run();
  // @ts-ignore -- awaited by async wrapper
      } catch {
        // Duplicate tag, skip
      }
    }
  }

  // ---- 8. Reports ----
  console.log('  🚩 Reports...');
  for (const report of mockReportedContentData) {
    db.insert(schema.reports).values({
      id: `report-${report.postId}`,
      postId: report.postId,
      reporterName: report.reporterName,
      reason: report.reason,
      reportedAt: report.reportedAt,
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 9. Events ----
  console.log('  📅 Events...');
  for (const event of sampleEventsData) {
    const tribe = tribesData.find(t => t.name === event.associatedTribe);
    db.insert(schema.events).values({
      id: event.id,
      name: event.name,
      keywords: event.keywords,
      description: event.description,
      eventDate: event.eventDate,
      associatedTribeId: tribe?.id,
      associatedTribeName: event.associatedTribe,
      coverImage: event.coverImage,
      dataAiHintCover: event.dataAiHintCover,
      isPublic: event.isPublic,
      creatorId: event.creatorId || MOCK_CURRENT_USER_ID,
      locationName: event.locationName,
      locationCityRegion: event.locationCityRegion,
      latitude: event.latitude,
      longitude: event.longitude,
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 9b. Event Stream Posts ----
  console.log('  💬 Event Stream Posts...');
  for (const esp of mockEventStreamPosts) {
    db.insert(schema.eventStreamPosts).values({
      id: esp.id,
      eventId: esp.eventId,
      authorId: esp.authorId,
      authorNickname: esp.authorNickname,
      authorAvatarFallback: esp.authorAvatarFallback,
      content: esp.content,
      imageUrl: esp.imageUrl,
      imageAlt: esp.imageAlt,
      createdAt: esp.timestamp,
    }).run();
  // @ts-ignore -- awaited by async wrapper
  }

  // ---- 10. Stories ----
  console.log('  📰 Stories...');
  for (const story of mockStoryTopics) {
    db.insert(schema.stories).values({
      id: story.id,
      title: story.title,
      summary: story.summary,
      category: story.category,
      curatorName: story.curator,
      curatorAvatar: story.curatorAvatar,
      curatorAvatarFallback: story.curatorAvatarFallback,
      dataAiHintCuratorAvatar: story.dataAiHintCuratorAvatar,
      coverImage: story.coverImage,
      dataAiHintCover: story.dataAiHintCover,
      discussionCount: story.discussionCount,
      lastUpdatedAt: story.lastUpdatedAt,
    }).run();
  // @ts-ignore -- awaited by async wrapper

    // Articles
    const articles = mockArticlesForStory[story.id];
    if (articles) {
      for (const art of articles) {
        db.insert(schema.storyArticles).values({
          id: art.id,
          storyId: story.id,
          title: art.title,
          url: art.url,
          sourceName: art.sourceName,
          publishedAt: art.publishedDate,
          summarySnippet: art.summarySnippet,
          dataAiHint: art.dataAiHint,
        }).run();
  // @ts-ignore -- awaited by async wrapper
      }
    }

    // Story comments
    const storyComments = mockCommentsForStory[story.id];
    if (storyComments) {
      const insertStoryComment = (comment: typeof storyComments[0], parentId: string | null) => {
        db.insert(schema.storyComments).values({
          id: comment.id,
          storyId: story.id,
          parentCommentId: parentId,
          authorId: comment.authorId,
          authorName: comment.authorName,
          authorAvatarFallback: comment.authorAvatarFallback,
          dataAiHintAvatar: comment.dataAiHintAvatar,
          content: comment.content,
          vibeCount: comment.vibes ?? 0,
          createdAt: comment.timestamp,
        }).run();
  // @ts-ignore -- awaited by async wrapper
        if (comment.replies) {
          for (const reply of comment.replies) {
            insertStoryComment(reply, comment.id);
          }
        }
      };
      for (const comment of storyComments) {
        insertStoryComment(comment, null);
      }
    }
  }

  console.log('✅ Seed complete!');

  // Summary
  const counts = {
    users: (await db.select().from(schema.users)).length,
    tribes: (await db.select().from(schema.tribes)).length,
    tribeMembers: (await db.select().from(schema.tribeMembers)).length,
    bonds: (await db.select().from(schema.bonds)).length,
    posts: (await db.select().from(schema.posts)).length,
    moodTags: (await db.select().from(schema.postMoodTags)).length,
    events: (await db.select().from(schema.events)).length,
    eventStreamPosts: (await db.select().from(schema.eventStreamPosts)).length,
    stories: (await db.select().from(schema.stories)).length,
    reports: (await db.select().from(schema.reports)).length,
    comments: (await db.select().from(schema.comments)).length,
  };
  console.log('\n📊 Seed Summary:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`   ${table}: ${count} rows`);
  }
}

seed().catch(console.error);
