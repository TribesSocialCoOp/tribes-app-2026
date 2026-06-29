/**
 * Staging Seed Script
 *
 * Populates a STAGING database with realistic synthetic fixtures so the app is
 * exercise-able: multiple tribes (public + private) with covers and mood tags,
 * a cast of users with varied roles/reputation, posts across rings with images
 * and engagement, comments, vibes, a governance proposal with votes, and an
 * event. Modeled on prod's actual usage shape (rings, mood vocab, join
 * mechanisms, member roles) — but entirely fabricated data, no prod PII.
 *
 * Run seed-production.ts first for the idempotent bootstrap (plans, system bot,
 * Trials tribe); remote_deploy.sh does both on staging.
 *
 * IDEMPOTENT: visible entities (tribes/posts) upsert so re-runs refresh covers
 * and content; the rest insert-or-skip. Safe to run on every staging deploy.
 *
 * SAFETY: refuses to run unless TRIBES_ENV=staging — can never touch prod.
 *
 * Run with: TRIBES_ENV=staging npx tsx src/db/seed-staging.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });
import { db } from './index';
import * as schema from './schema';

if (process.env.TRIBES_ENV !== 'staging') {
  console.error(
    '✗ Refusing to run: TRIBES_ENV is not "staging" (got: ' +
      JSON.stringify(process.env.TRIBES_ENV) +
      '). This script only runs against staging databases.',
  );
  process.exit(1);
}

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000);
const daysAhead = (d: number) => new Date(now.getTime() + d * 86400_000);
const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// ── Cast (famous computer scientists — obviously synthetic) ──
const USERS = [
  { id: 'stg_user_ada', name: 'Ada Lovelace', role: 'Creator', rep: 'Elder', score: 420, bio: 'First programmer. Founder of the Staging Lab.' },
  { id: 'stg_user_grace', name: 'Grace Hopper', role: 'Human_Paid', rep: 'Member', score: 260, bio: 'Compiler pioneer. Debugs everything.' },
  { id: 'stg_user_margaret', name: 'Margaret Hamilton', role: 'Creator', rep: 'Elder', score: 390, bio: 'Software engineering, literally.' },
  { id: 'stg_user_alan', name: 'Alan Turing', role: 'Human_Free', rep: 'Newcomer', score: 70, bio: 'Asking the hard questions.' },
  { id: 'stg_user_katherine', name: 'Katherine Johnson', role: 'Human_Paid', rep: 'Member', score: 230, bio: 'Trajectories and trail maps.' },
  { id: 'stg_user_barbara', name: 'Barbara Liskov', role: 'Creator', rep: 'Elder', score: 360, bio: 'Substitutable opinions only.' },
  { id: 'stg_user_radia', name: 'Radia Perlman', role: 'Human_Member', rep: 'Member', score: 180, bio: 'Keeping the network from looping.' },
  { id: 'stg_user_hedy', name: 'Hedy Lamarr', role: 'Human_Paid', rep: 'Member', score: 200, bio: 'Frequency-hopping foodie.' },
  { id: 'stg_user_linus', name: 'Linus Torvalds', role: 'Human_Free', rep: 'Newcomer', score: 95, bio: 'Game night organizer.' },
  { id: 'stg_user_tim', name: 'Tim Berners-Lee', role: 'Human_Paid', rep: 'Member', score: 175, bio: 'Linking pages and people.' },
  { id: 'stg_user_dennis', name: 'Dennis Ritchie', role: 'Human_Free', rep: 'Newcomer', score: 55, bio: 'Low-level lurker.' },
  { id: 'stg_user_claude', name: 'Claude Shannon', role: 'Human_Free', rep: 'Newcomer', score: 80, bio: 'Information, theoretically.' },
];

// ── Tribes (real covers; public/private mix; prod join mechanisms) ──
const TRIBES = [
  { id: 'stg_tribe_lab', slug: 'staging-lab', name: 'Staging Lab', desc: 'A public sandbox tribe for exercising staging features.', cover: '/seed/tribe-makerspace.svg', isPublic: true, isListed: false, join: 'instant', founder: 'stg_user_ada', moods: ['discover', 'learn'] },
  { id: 'stg_tribe_hiking', slug: 'trail-seekers', name: 'Trail Seekers', desc: 'Weekend hikes, summit photos, and route beta.', cover: '/seed/tribe-hiking.svg', isPublic: true, isListed: false, join: 'instant', founder: 'stg_user_margaret', moods: ['discover', 'heal'] },
  { id: 'stg_tribe_foodies', slug: 'foodies-united', name: 'Foodies United', desc: 'Recipes, restaurant finds, and kitchen experiments.', cover: '/seed/tribe-foodies.svg', isPublic: true, isListed: false, join: 'approval', founder: 'stg_user_hedy', moods: ['showcase', 'connect'] },
  { id: 'stg_tribe_books', slug: 'page-turners', name: 'Page Turners', desc: 'A book club for slow reads and big ideas.', cover: '/seed/tribe-books.svg', isPublic: true, isListed: false, join: 'instant', founder: 'stg_user_barbara', moods: ['learn', 'reflect'] },
  { id: 'stg_tribe_games', slug: 'game-night', name: 'Game Night', desc: 'Co-op runs, tabletop nights, and friendly trash talk.', cover: '/seed/tribe-games.svg', isPublic: true, isListed: false, join: 'instant', founder: 'stg_user_linus', moods: ['game', 'chill'] },
  // Normal private tribe: isListed=false so it is hidden from guest discovery.
  // (isListed=true is reserved for NSFW tribes — the only case the policy lists
  // a private tribe to guests. Setting it on a non-NSFW private tribe leaks it.)
  { id: 'stg_tribe_inner', slug: 'staging-inner', name: 'Staging Inner Circle', desc: 'A private tribe for testing membership + approval flows.', cover: '/seed/tribe-ai.svg', isPublic: false, isListed: false, join: 'approval', founder: 'stg_user_ada', moods: ['kin', 'focus'] },
];

// ── Memberships: [tribeId, userId, role] ──
const MEMBERS: [string, string, string][] = [
  ['stg_tribe_lab', 'stg_user_ada', 'founder'], ['stg_tribe_lab', 'stg_user_grace', 'speaker'], ['stg_tribe_lab', 'stg_user_alan', 'member'], ['stg_tribe_lab', 'stg_user_claude', 'member'],
  ['stg_tribe_hiking', 'stg_user_margaret', 'founder'], ['stg_tribe_hiking', 'stg_user_katherine', 'speaker'], ['stg_tribe_hiking', 'stg_user_tim', 'member'], ['stg_tribe_hiking', 'stg_user_grace', 'member'],
  ['stg_tribe_foodies', 'stg_user_hedy', 'founder'], ['stg_tribe_foodies', 'stg_user_radia', 'member'], ['stg_tribe_foodies', 'stg_user_dennis', 'member'],
  ['stg_tribe_books', 'stg_user_barbara', 'founder'], ['stg_tribe_books', 'stg_user_alan', 'speaker'], ['stg_tribe_books', 'stg_user_claude', 'member'],
  ['stg_tribe_games', 'stg_user_linus', 'founder'], ['stg_tribe_games', 'stg_user_dennis', 'member'], ['stg_tribe_games', 'stg_user_tim', 'member'],
  ['stg_tribe_inner', 'stg_user_ada', 'founder'], ['stg_tribe_inner', 'stg_user_margaret', 'speaker'], ['stg_tribe_inner', 'stg_user_barbara', 'member'],
];

// ── Posts: tribe feed + personal rings. _vibes = how many to fabricate ──
type Seed = { id: string; tribe: string | null; author: string; ring: string; title?: string; content: string; img?: string; mood?: string; pinned?: boolean; days: number; _vibes: number; _comments: [string, string][] };
const POSTS: Seed[] = [
  { id: 'stg_post_welcome', tribe: 'stg_tribe_lab', author: 'stg_user_ada', ring: 'tribes', title: 'Welcome to the Staging Lab', content: 'This is synthetic content on staging. Poke at anything — nothing here is real.', mood: 'learn', pinned: true, days: 6, _vibes: 5, _comments: [['stg_user_grace', 'Looks great. Filing my first bug already.'], ['stg_user_alan', 'Is the composer supposed to do that?']] },
  { id: 'stg_post_demo', tribe: 'stg_tribe_lab', author: 'stg_user_grace', ring: 'tribes', content: 'Proposing a weekly demo so we dogfood new features before prod.', mood: 'discourse', days: 3, _vibes: 4, _comments: [['stg_user_claude', 'Strong +1.']] },
  { id: 'stg_post_summit', tribe: 'stg_tribe_hiking', author: 'stg_user_margaret', ring: 'tribes', title: 'Sunrise from Eagle Ridge', content: 'Caught the sunrise after a 4am start. Worth every switchback.', img: '/seed/post-landscape.svg', mood: 'heal', days: 2, _vibes: 8, _comments: [['stg_user_katherine', 'Stunning. What trailhead?'], ['stg_user_tim', 'Adding this to my list.']] },
  { id: 'stg_post_route', tribe: 'stg_tribe_hiking', author: 'stg_user_katherine', ring: 'tribes', content: 'Route beta for the north loop: 11mi, ~2400ft gain, water at mile 6.', mood: 'discover', days: 5, _vibes: 3, _comments: [] },
  { id: 'stg_post_ramen', tribe: 'stg_tribe_foodies', author: 'stg_user_hedy', ring: 'tribes', title: '36-hour tonkotsu', content: 'Finally nailed the broth. Recipe in comments.', img: '/seed/post-food.svg', mood: 'showcase', days: 1, _vibes: 9, _comments: [['stg_user_radia', 'Need that recipe!'], ['stg_user_dennis', 'My arteries say no, my heart says yes.']] },
  { id: 'stg_post_bookclub', tribe: 'stg_tribe_books', author: 'stg_user_barbara', ring: 'tribes', title: 'This month: The Dispossessed', content: 'Le Guin for the win. Discussion thread opens Friday.', mood: 'reflect', days: 4, _vibes: 6, _comments: [['stg_user_alan', 'Been meaning to reread this.']] },
  { id: 'stg_post_coop', tribe: 'stg_tribe_games', author: 'stg_user_linus', ring: 'tribes', title: 'Co-op night Thursday', content: 'Hopping on at 8pm. Bring a friend, we have spare slots.', img: '/seed/post-music.svg', mood: 'game', days: 2, _vibes: 5, _comments: [['stg_user_tim', 'In!']] },
  { id: 'stg_post_inner', tribe: 'stg_tribe_inner', author: 'stg_user_ada', ring: 'tribes', content: 'Members-only thread for testing private visibility + approvals.', mood: 'focus', days: 3, _vibes: 2, _comments: [['stg_user_margaret', 'Can confirm outsiders cannot see this.']] },
  { id: 'stg_post_journal1', tribe: null, author: 'stg_user_grace', ring: 'journal', content: 'Personal journal entry — testing the journal ring rendering.', mood: 'vent', days: 1, _vibes: 1, _comments: [] },
  { id: 'stg_post_people1', tribe: null, author: 'stg_user_tim', ring: 'my_people', content: 'A my-people ring post — should reach my network, not the public feed.', mood: 'connect', days: 2, _vibes: 3, _comments: [['stg_user_grace', 'Nice to see ring scoping work.']] },
];

const EMOJIS = ['👍', '❤️', '🔥', '🎉', '💡', '🙌'];

async function seedStaging() {
  console.log('🌱 Staging seed starting...');

  // Users
  for (const u of USERS) {
    await db.insert(schema.users).values({
      id: u.id, name: u.name, email: u.id.replace('stg_user_', '') + '@staging.tribes.app',
      role: u.role, bio: u.bio, slug: u.id.replace('stg_user_', '') + '-staging',
      username: u.id.replace('stg_user_', '') + '_stg', reputationScore: u.score,
      reputationStatus: u.rep, emailVerified: true, createdAt: daysAgo(30),
    }).onConflictDoNothing({ target: schema.users.id });
  }
  console.log(`  ✓ ${USERS.length} users`);

  // Tribes (upsert so covers/content refresh) + mood tags + founder membership counts
  const memberCounts = new Map<string, number>();
  for (const [tribeId] of MEMBERS) memberCounts.set(tribeId, (memberCounts.get(tribeId) ?? 0) + 1);
  for (const t of TRIBES) {
    const row = {
      id: t.id, slug: t.slug, name: t.name, description: t.desc, cover: t.cover,
      isPublic: t.isPublic, isListed: t.isListed, joinMechanism: t.join,
      createdBy: t.founder, memberCount: memberCounts.get(t.id) ?? 1, createdAt: daysAgo(20),
    };
    await db.insert(schema.tribes).values(row).onConflictDoUpdate({
      target: schema.tribes.id,
      set: { slug: row.slug, name: row.name, description: row.description, cover: row.cover, isPublic: row.isPublic, isListed: row.isListed, joinMechanism: row.joinMechanism, memberCount: row.memberCount },
    });
    for (const mood of t.moods) {
      await db.insert(schema.tribeMoodTags).values({ tribeId: t.id, moodSlug: mood }).onConflictDoNothing();
    }
  }
  console.log(`  ✓ ${TRIBES.length} tribes (+ covers, mood tags)`);

  // Memberships
  for (const [tribeId, userId, role] of MEMBERS) {
    await db.insert(schema.tribeMembers).values({
      id: `stg_mem_${tribeId}_${userId}`, tribeId, userId, role, joinedAt: daysAgo(18),
    }).onConflictDoNothing({ target: schema.tribeMembers.id });
  }
  console.log(`  ✓ ${MEMBERS.length} memberships`);

  // Posts (+ comments + vibes), with denormalized counts kept consistent
  let commentTotal = 0, vibeTotal = 0;
  for (let pi = 0; pi < POSTS.length; pi++) {
    const p = POSTS[pi];
    const author = USERS.find((u) => u.id === p.author)!;
    await db.insert(schema.posts).values({
      id: p.id, slug: p.id.replace('stg_post_', 'stg-') , tribeId: p.tribe, authorId: p.author,
      authorName: author.name, authorAvatarFallback: initials(author.name),
      title: p.title ?? null, content: p.content, imageUrl: p.img ?? null,
      ring: p.ring, moodTag: p.mood ?? null, isPinned: p.pinned ?? false,
      vibeCount: p._vibes, commentCount: p._comments.length, createdAt: daysAgo(p.days),
    }).onConflictDoUpdate({
      target: schema.posts.id,
      set: { content: p.content, title: p.title ?? null, imageUrl: p.img ?? null, moodTag: p.mood ?? null, ring: p.ring, isPinned: p.pinned ?? false, vibeCount: p._vibes, commentCount: p._comments.length, tribeId: p.tribe },
    });

    // Comments
    for (let ci = 0; ci < p._comments.length; ci++) {
      const [uid, text] = p._comments[ci];
      const cu = USERS.find((u) => u.id === uid)!;
      await db.insert(schema.comments).values({
        id: `stg_cmt_${pi}_${ci}`, postId: p.id, authorId: uid, authorName: cu.name,
        authorAvatarFallback: initials(cu.name), content: text, createdAt: daysAgo(Math.max(0, p.days - 1)),
      }).onConflictDoNothing({ target: schema.comments.id });
      commentTotal++;
    }

    // Vibes — distinct users per post (respects unique(userId,targetId,targetType))
    for (let vi = 0; vi < Math.min(p._vibes, USERS.length); vi++) {
      await db.insert(schema.vibes).values({
        id: `stg_vibe_${pi}_${vi}`, userId: USERS[vi].id, targetId: p.id, targetType: 'post',
        emoji: EMOJIS[vi % EMOJIS.length], createdAt: daysAgo(Math.max(0, p.days - 1)),
      }).onConflictDoNothing({ target: schema.vibes.id });
      vibeTotal++;
    }
  }
  console.log(`  ✓ ${POSTS.length} posts (+ ${commentTotal} comments, ${vibeTotal} vibes)`);

  // Governance: one proposal with options + votes in the Staging Lab
  await db.insert(schema.proposals).values({
    id: 'stg_prop_demo', title: 'Adopt a weekly staging demo?', slug: 'stg-weekly-demo',
    description: 'Should we hold a 30-minute weekly demo to dogfood features before they ship to prod?',
    createdBy: 'stg_user_grace', tribeId: 'stg_tribe_lab', status: 'active',
    deadline: daysAhead(5), voteCount: 5, createdAt: daysAgo(2),
  }).onConflictDoNothing({ target: schema.proposals.id });
  const OPTIONS = [
    { id: 'stg_opt_yes', label: 'Yes, weekly', votes: 3, sort: 0 },
    { id: 'stg_opt_biweekly', label: 'Every other week', votes: 2, sort: 1 },
    { id: 'stg_opt_no', label: 'No', votes: 0, sort: 2 },
  ];
  for (const o of OPTIONS) {
    await db.insert(schema.proposalOptions).values({ id: o.id, proposalId: 'stg_prop_demo', label: o.label, voteCount: o.votes, sortOrder: o.sort }).onConflictDoNothing({ target: schema.proposalOptions.id });
  }
  const VOTERS: [string, string][] = [['stg_user_ada', 'stg_opt_yes'], ['stg_user_alan', 'stg_opt_yes'], ['stg_user_claude', 'stg_opt_yes'], ['stg_user_grace', 'stg_opt_biweekly'], ['stg_user_margaret', 'stg_opt_biweekly']];
  for (const [uid, oid] of VOTERS) {
    await db.insert(schema.votes).values({ id: `stg_vote_${uid}`, proposalId: 'stg_prop_demo', optionId: oid, userId: uid, createdAt: daysAgo(1) }).onConflictDoNothing({ target: schema.votes.id });
  }
  console.log('  ✓ 1 proposal (3 options, 5 votes)');

  // An event in the hiking tribe
  await db.insert(schema.events).values({
    id: 'stg_event_summit', name: 'Summit Sunrise Hike', slug: 'stg-summit-sunrise',
    description: 'Group hike to catch sunrise from Eagle Ridge. Meet at the trailhead, headlamps required.',
    eventDate: daysAhead(10), associatedTribeId: 'stg_tribe_hiking', associatedTribeName: 'Trail Seekers',
    coverImage: '/seed/event-summit.svg', isPublic: true, creatorId: 'stg_user_margaret',
    locationName: 'Eagle Ridge Trailhead', locationCityRegion: 'Cascade Range',
  }).onConflictDoNothing({ target: schema.events.id });
  console.log('  ✓ 1 event');

  // Summary
  console.log('\n✅ Staging seed complete!');
  for (const [t, q] of [['users', schema.users], ['tribes', schema.tribes], ['tribe_members', schema.tribeMembers], ['posts', schema.posts], ['comments', schema.comments], ['vibes', schema.vibes], ['proposals', schema.proposals], ['events', schema.events]] as const) {
    console.log(`   ${t}: ${(await db.select().from(q)).length}`);
  }
}

seedStaging().catch((err) => {
  console.error(err);
  process.exit(1);
});
