
import type { UserRole, Event, Bond, TribePost, ReportedPost, DiscussionComment, TribeMember, PendingMember, MoodStreamPost, UserProfile, Tribe, StoryTopic, SourceArticle } from '@/lib/types';

// Mock data moved from data.ts
export const tribesData: Tribe[] = [
  { id: "0", slug: "welcome", name: "Welcome to Tribes", description: "Your starting point on Tribes.app! Learn how to navigate, form bonds, join communities, and make this platform your own.", members: 9999, isPublic: true, cover: "/seed/tribe-trials.svg", dataAiHint: "welcome onboarding guide", moods: ["learn", "connect"], homepageUrl: "https://tribes.app", joinMechanism: 'instant', brandColor: '#6366f1' },
  { id: "1", slug: "ai-innovators", name: "AI Innovators", description: "Exploring the future of artificial intelligence and machine learning. Professional networking and project discussions.", members: 128, isPublic: true, cover: "/seed/tribe-ai.svg", dataAiHint: "technology innovation", moods: ["focus", "learn"], homepageUrl: "https://innovate.ai", joinMechanism: 'approval', minimumReputation: 'Active', minimumAccountAgeDays: 30, brandColor: '#10b981' },
  { id: "2", slug: "weekend-hikers-club", name: "Weekend Hikers Club", description: "Sharing trails, tips, and breathtaking views from our adventures in nature.", members: 76, isPublic: true, cover: "/seed/tribe-hiking.svg", dataAiHint: "nature mountain", moods: ["discover", "connect"], joinMechanism: 'instant', brandColor: '#f59e0b' },
  { id: "3", slug: "indie-game-devs", name: "Indie Game Devs", description: "A community for indie game developers to collaborate, share projects, and find local playtesters.", members: 245, isPublic: false, cover: "/seed/tribe-games.svg", dataAiHint: "gaming development", moods: ["showcase", "game", "learn"], homepageUrl: "https://indiegamedev.guild", joinMechanism: 'instant', brandColor: '#ec4899' },
  { id: "4", slug: "local-bookworms", name: "Local Bookworms", description: "Discussing our favorite reads and discovering new authors together. Regular meetups.", members: 55, isPublic: true, cover: "/seed/tribe-books.svg", dataAiHint: "reading library", moods: ["learn", "chill", "connect"], joinMechanism: 'approval', brandColor: '#8b5cf6' },
  { id: "5", slug: "sustainable-living-hub", name: "Sustainable Living Hub", description: "Tips and discussions on eco-friendly practices and sustainability projects.", members: 92, isPublic: true, cover: "/seed/tribe-gardeners.svg", dataAiHint: "nature environment", moods: ["learn", "discover"], joinMechanism: 'instant', brandColor: '#16a34a' },
  { id: "6", slug: "family-hub", name: "Family Hub", description: "A private space for our family to connect, share updates, and plan events.", members: 15, isPublic: false, cover: "/seed/tribe-parents.svg", dataAiHint: "family home", moods: ["connect"], joinMechanism: 'approval', brandColor: '#f43f5e' },
  { id: "7", slug: "the-local-gig-circuit", name: "The Local Gig Circuit", description: "Discover and discuss live music, local bands, and upcoming shows in our city. Connect with fellow music lovers.", members: 88, isPublic: true, cover: "/seed/tribe-music.svg", dataAiHint: "live music concert", moods: ["discover", "connect", "showcase"], joinMechanism: 'instant', brandColor: '#3b82f6' },
  { id: "8", slug: "artisan-alley-collective", name: "Artisan Alley Collective", description: "A space for creators, makers, and artists to share their work, find pop-up opportunities, and support each other.", members: 150, isPublic: true, cover: "/seed/tribe-makerspace.svg", dataAiHint: "crafts art market", moods: ["showcase", "shop", "connect"], joinMechanism: 'approval', minimumReputation: 'Newcomer', minimumAccountAgeDays: 7, brandColor: '#d946ef' },
  { id: "9", slug: "open-mic-night-crew", name: "Open Mic Night Crew", description: "For performers (comedy, poetry, music) and fans of open mic nights. Share your material, find venues, and connect.", members: 62, isPublic: true, cover: "/seed/tribe-filmmakers.svg", dataAiHint: "performance comedy poetry", moods: ["showcase", "discover", "connect"], joinMechanism: 'instant', brandColor: '#14b8a6' },
];

export const MOCK_USER_ROLE: UserRole = 'Creator';
export const MOCK_CURRENT_USER_ID = "authorAE"; 

export const mockUserProfile: UserProfile = {
  id: MOCK_CURRENT_USER_ID,
  name: "Alice Example",
  email: "alice@example.com",
  role: MOCK_USER_ROLE,
  bio: "Lover of tech, hiking, and indie games.",
  avatar: "/seed/avatar-default.svg",
  aliases: [
    { name: "WonderlandCoder", avatar: "/seed/avatar-default.svg" },
    { name: "HikerGal", avatar: "/seed/avatar-default.svg" },
    { name: "PixelPioneer", avatar: "/seed/avatar-default.svg" }
  ],
  reservedAlias: "@alice_example",
  reputationScore: 50,
  reputationStatus: 'Onboarding',
  accountCreatedAt: new Date(),
};

const MOCK_EVENT_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();
export const sampleEventsData: Event[] = [
  {
    id: "event1",
    name: "Summer Music Festival Kick-off",
    keywords: "Live Music, Outdoor, Summer, Festival",
    description: "Join us for the grand opening of the Summer Music Festival! Featuring top local bands, food trucks, and amazing vibes.",
    eventDate: new Date(MOCK_EVENT_DATE_MS + 86400000 * 30),
    associatedTribe: "The Local Gig Circuit",
    coverImage: "/seed/event-summit.svg",
    dataAiHintCover: "music festival concert",
    isPublic: true,
    creatorId: "user123",
    locationName: "Downtown Park Amphitheater",
    locationCityRegion: "Springfield, IL",
    latitude: 39.7817, 
    longitude: -89.6501,
  },
  {
    id: "event2",
    name: "Tech Innovators Summit - AI Edition",
    keywords: "Technology, AI, Networking, Workshop",
    description: "A deep dive into the latest advancements in Artificial Intelligence.",
    eventDate: new Date(MOCK_EVENT_DATE_MS + 86400000 * 60),
    associatedTribe: "AI Innovators",
    coverImage: "/seed/event-summit.svg",
    dataAiHintCover: "technology conference abstract",
    isPublic: true,
    creatorId: "user456",
    locationName: "Grand Tech Convention Center",
    locationCityRegion: "New York, NY",
    latitude: 40.7128,
    longitude: -74.0060,
  },
];

const MOCK_POST_DATE_MS = Date.now();
export const initialSampleTribePosts: TribePost[] = [
  {
    id: "welcome_post_1", tribeId: "0", authorId: "dustin", authorName: "Dustin Moore", authorAvatarFallback: "DM",
    timestamp: new Date(MOCK_POST_DATE_MS),
    title: "Welcome to Tribes! 🎉 Start Here",
    content: `Welcome to Tribes! 🎉\n\nHey, I'm Dustin. I built this place because I was tired of social platforms that treat people like content to be consumed. Tribes is different.\n\n**This isn't a platform for scrolling. It's a platform for sharing.** There are no algorithms here. No engagement tricks. Your feed is just the people and communities you actually connect with.\n\n## How it works\n\n**🔗 Bonds** are your connections with real people. When you bond with someone, you both get encrypted passkeys that let you see each other's stuff. Bonds are mutual and they stay alive as long as you keep interacting. If you drift apart, the bond goes dormant. No hard cutoff, and you can always reconnect.\n\n**🛡️ Inner Circle** is for your closest people. Any bond can be toggled into your Inner Circle for longer access and your most personal content ring.\n\n**🏕️ Tribes** are communities. Each one has its own feed, members, and vibe. Some you can join right away, others need approval.\n\n**🔔 Rings** control who sees what:\n- *Journal* is private, just for you\n- *Inner Circle* goes to your closest bonds\n- *My People* goes to everyone you're bonded with\n- *Tribes* goes to tribe members\n\n## Getting started\n\n1. **Check out Discover** and find some tribes that interest you\n2. **Form some bonds** with people via invite links or NFC tap\n3. **Post something!** Share a thought with your people or a tribe\n4. **Set a mood** on your posts to help others find your vibe\n\nWelcome aboard. This is your space, make it yours. ✌️`,
    vibes: 12, comments: 3, dataAiHintAvatar: "founder portrait",
    isPinned: true,
  },
  {
    id: "welcome_post_2", tribeId: "0", authorId: "dustin", authorName: "Dustin Moore", authorAvatarFallback: "DM",
    timestamp: new Date(MOCK_POST_DATE_MS - 60000),
    title: "Understanding Bonds",
    content: `## Understanding Bonds 🔗\n\nBonds are how you connect with people on Tribes. Think of them like a handshake that actually means something.\n\n### How it works\n\nWhen you connect with someone, you each get a **passkey**. It's an encrypted key that lets you access each other's shared content. These passkeys have a lifespan:\n\n| Bond Type | Duration | How it refreshes |\n|-----------|----------|------------------|\n| **Person Bond** | 180 days | Refreshes automatically when you interact |\n| **Inner Circle** | 365 days | Same, but with access to closer content |\n| **Tribe Bond** | 90 days | Refreshes when you engage with the tribe |\n\n### When bonds expire\n\n**Person bonds go dormant**, not deleted. Your connection is still there, but content access pauses. Either person can send a **Reconnect Request** and if the other says yes, you're back.\n\nTribe bonds just expire. Rejoin the tribe to get back in.\n\n### Ways to form bonds\n\n- **Invite Link** from your Circles page\n- **NFC Tap** if your phone supports it (pretty cool honestly)\n- **Bond Request** by searching for someone\n- **Introduction** from a mutual connection\n\n### Inner Circle\n\nAny bond can be promoted to your **Inner Circle**. These are your most trusted people. They see content you post to the Inner Circle ring and get a longer 365-day passkey. You can toggle this on or off anytime from the bond menu.\n\nThe idea behind all of this is simple: **relationships that matter should be maintained.** And ones that naturally drift? Let them rest. No hard cutoffs. Just gentle fading, with the door always open to reconnect.`,
    vibes: 8, comments: 1, dataAiHintAvatar: "founder portrait",
    isPinned: true,
  },
  {
    id: "welcome_post_3", tribeId: "0", authorId: "dustin", authorName: "Dustin Moore", authorAvatarFallback: "DM",
    timestamp: new Date(MOCK_POST_DATE_MS - 120000),
    title: "Getting Around Tribes",
    content: `## Getting Around Tribes 🧭\n\nQuick tour of the main areas:\n\n### 📰 Your Comms (Feed)\nThis is your main feed. Everything shows up here: posts from bonds, tribes, and mood streams. Use the **ring filters** at the top to focus:\n- **All** for the full stream\n- **Journal** for your private posts\n- **Inner Circle** for your closest bonds\n- **My People** for all bonded users\n- **Tribes** for tribe content\n- **Streams** for mood-promoted posts across the platform\n\n### ⭕ Circles\nThis is where you manage your connections:\n- **Bonds tab** to see all your bonds, their status, and settings\n- **Tribes tab** to see what tribes you belong to\n\n### 🏕️ Discover\nFind new tribes to join. Browse around, search, or see what's popular.\n\n### 🧱 My Wall\nYour public profile. Pin journal posts to your wall to curate what people see when they visit you. Think of it like a living portfolio that updates as you go.\n\n### 🎨 Moods\nEvery post can carry a mood tag (Chill, Focus, Discover, Connect, etc.). Tribe founders can promote posts to **Mood Streams**, which are platform-wide feeds filtered by vibe. It's how good content gets found without needing an algorithm.\n\n---\n\nGot questions? Post them right here. That's what this tribe is for! 💬`,
    vibes: 5, comments: 0, dataAiHintAvatar: "founder portrait",
    isPinned: false,
  },
  {
    id: "ai_post_1", tribeId: "1", authorId: "authorAE", authorName: "Alice Example", authorAvatarFallback: "AE",
    timestamp: new Date(MOCK_POST_DATE_MS - 86400000),
    title: "The future of Agentic Workflows",
    content: "I've been thinking a lot about how we move from simple LLM prompts to complex agentic loops. The main challenge seems to be reliable state management across long-running tasks.\n\nWhat patterns are you all seeing in production? We're currently experimenting with a hierarchical supervisor model where a 'planner' delegates sub-tasks to specialized workers.",
    vibes: 42, comments: 4,
    commentsData: [
      {
        id: "ai_comment_1", authorId: "authorXY", authorName: "AI Ethicist", authorAvatarFallback: "AE",
        content: "The hierarchical model works great until the planner gets stuck in a loop. Have you implemented any circuit breakers?",
        timestamp: new Date(MOCK_POST_DATE_MS - 86400000 + 3600000),
        vibes: 5,
        replies: [
          {
            id: "ai_reply_1", authorId: "authorAE", authorName: "Alice Example", authorAvatarFallback: "AE",
            content: "Exactly! We added a max-turn counter and a validator agent that checks if the plan is actually progressing.",
            timestamp: new Date(MOCK_POST_DATE_MS - 86400000 + 7200000),
            vibes: 3,
          }
        ]
      },
      {
        id: "ai_comment_2", authorId: "user2", authorName: "Bob Builder", authorAvatarFallback: "BB",
        content: "I'm more interested in the observability side. How are you tracing these agent decisions?",
        timestamp: new Date(MOCK_POST_DATE_MS - 86400000 + 4200000),
        vibes: 2,
      },
      {
        id: "ai_comment_3", authorId: "test-service-member", authorName: "TSM", authorAvatarFallback: "TS",
        content: "We should host a workshop on this. There's a lot of interest in the tribe.",
        timestamp: new Date(MOCK_POST_DATE_MS - 86400000 + 10000000),
        vibes: 10,
      }
    ]
  },
  {
    id: "hiking_post_1", tribeId: "2", authorId: "test-speaker-user", authorName: "Speaker Sam", authorAvatarFallback: "SS",
    timestamp: new Date(MOCK_POST_DATE_MS - 43200000),
    title: "Best sunrise spot at Blue Mountain?",
    content: "Planning a hike this Saturday and want to catch the sunrise. Is the North Ridge still the best spot, or has anyone found a better lookout recently?",
    vibes: 15, comments: 2,
    commentsData: [
      {
        id: "hike_comment_1", authorId: "user3", authorName: "Carol Cosmos", authorAvatarFallback: "CC",
        content: "North Ridge is classic, but Eagle's Peak is actually better this time of year because the sun rises further south.",
        timestamp: new Date(MOCK_POST_DATE_MS - 43200000 + 1800000),
        vibes: 4,
      },
      {
        id: "hike_comment_2", authorId: "test-free-user", authorName: "Free Explorer", authorAvatarFallback: "FE",
        content: "Watch out for the mud on the lower trail, rained quite a bit last night.",
        timestamp: new Date(MOCK_POST_DATE_MS - 43200000 + 3600000),
        vibes: 1,
      }
    ]
  },
  {
    id: "game_post_1", tribeId: "3", authorId: "authorRD", authorName: "RockstarDev", authorAvatarFallback: "RD",
    timestamp: new Date(MOCK_POST_DATE_MS - 172800000),
    title: "Just released my first demo on itch.io!",
    content: "It's a small puzzle game called 'Refract'. Would love some feedback from fellow devs. It's built in Godot 4 and uses some pretty neat shader tricks for the lighting.\n\nCheck it out here: [itch.io/refract](https://example.com/itch)",
    imageUrl: "/seed/post-landscape.svg",
    imageAlt: "Game screenshot",
    vibes: 88, comments: 1,
    commentsData: [
      {
        id: "game_comment_1", authorId: "test-service-admin", authorName: "Test Service Admin", authorAvatarFallback: "TA",
        content: "This looks stunning! The lighting really adds to the atmosphere. I'll give it a play tonight.",
        timestamp: new Date(MOCK_POST_DATE_MS - 172800000 + 7200000),
        vibes: 12,
      }
    ]
  },
  {
    id: "multi_image_test_post",
    tribeId: "2",
    authorId: "test-speaker-user",
    authorName: "Speaker Sam",
    authorAvatarFallback: "SS",
    timestamp: new Date(MOCK_POST_DATE_MS - 21600000),
    title: "Weekend trail photos",
    content: "Snapped a few shots from the loop trail yesterday. The wildflowers are peaking right now!",
    imageUrls: ["/seed/post-landscape.svg", "/seed/post-food.svg", "/seed/post-music.svg"],
    vibes: 23,
    comments: 2,
    commentsData: [
      {
        id: "multi_img_comment_1", authorId: "user3", authorName: "Carol Cosmos", authorAvatarFallback: "CC",
        content: "Gorgeous shots! What trail is this?",
        timestamp: new Date(MOCK_POST_DATE_MS - 21600000 + 1800000),
        vibes: 3,
      },
      {
        id: "multi_img_comment_2", authorId: "authorAE", authorName: "Alice Example", authorAvatarFallback: "AE",
        content: "Love the second one. The lighting is perfect.",
        timestamp: new Date(MOCK_POST_DATE_MS - 21600000 + 3600000),
        vibes: 1,
      }
    ]
  },
  {
    id: "svg_darkmode_test_post",
    tribeId: "1",
    authorId: "dustin",
    authorName: "Dustin Moore",
    authorAvatarFallback: "DM",
    timestamp: new Date(MOCK_POST_DATE_MS + 60000),
    title: "SVG Dark Mode Rendering Test Post",
    content: "This post contains the production SVG diagram (`/test-svg-darkmode.svg`) that was rendering as a black box in Chrome/Firefox/Safari when dark mode was active.",
    imageUrl: "/test-svg-darkmode.svg",
    imageAlt: "Production SVG test",
    vibes: 1,
    comments: 0,
  },
];


export const allMoodStreamPosts: MoodStreamPost[] = [
  {
    id: "msp1",
    authorId: "dustin",
    title: "The perfect lofi beat for a rainy day",
    content: "Just found this amazing lofi hip hop mix on YouTube.",
    author: "ChillCoder",
    authorAvatarSrc: "/seed/avatar-default.svg",
    authorAvatarFallback: "CC",
    tribeName: "AI Innovators",
    imageUrl: "/seed/post-music.svg",
    imageAlt: "lofi desk",
    moodTags: ["chill", "focus"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000),
    vibes: 152,
    comments: 12,
    dataAiHintAvatar: "coder chill",
    dataAiHintImage: "lofi desk",
  },
];

export const mockReportedContentData: ReportedPost[] = [
  { postId: "msp1", postTitle: "My Top 5 Productivity Hacks for Deep Work", reporterName: "ConcernedUser42", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "Off-topic" },
];

export const bondsData: Bond[] = [
  { id: "b1", targetId: "1", targetName: "AI Innovators Tribe", targetType: "tribe", bondType: "tribe", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 30), expiresAt: new Date(MOCK_POST_DATE_MS + 86400000 * 60), reconnectsCount: 2, connectionScore: 10, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
  { id: "b2", targetId: "user2", targetName: "Bob Builder", targetType: "user", bondType: "person", formationMethod: "virtual_request", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 10), expiresAt: new Date(MOCK_POST_DATE_MS + 86400000 * 170), reconnectsCount: 0, connectionScore: 25, showInIntercom: true, allowChatInitiation: true, keyType: "standard", innerCircle: true },
  { id: "b3", targetId: "user3", targetName: "Carol Cosmos", targetType: "user", bondType: "person", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 60), expiresAt: new Date(MOCK_POST_DATE_MS + 86400000 * 120), reconnectsCount: 1, connectionScore: 5, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
  { id: "b4", targetId: "user4", targetName: "Dave Dormant", targetType: "user", bondType: "person", formationMethod: "virtual_request", passkeyStatus: "dormant", lastRefreshedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 200), expiresAt: new Date(MOCK_POST_DATE_MS - 86400000 * 20), reconnectsCount: 3, connectionScore: 40, showInIntercom: false, allowChatInitiation: false, keyType: "standard" },
  { id: "b5", targetId: "user123", targetName: "Summer Music Festival", targetType: "user", bondType: "event", eventId: "event1", formationMethod: "virtual_request", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_POST_DATE_MS), expiresAt: new Date(MOCK_POST_DATE_MS + 86400000 * 365), reconnectsCount: 0, connectionScore: 0, showInIntercom: false, allowChatInitiation: false, keyType: "event_attendee" },
  { id: "b6", targetId: "2", targetName: "Weekend Hikers Club", targetType: "tribe", bondType: "tribe", formationMethod: "virtual_request", passkeyStatus: "fading", lastRefreshedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 85), expiresAt: new Date(MOCK_POST_DATE_MS + 86400000 * 5), reconnectsCount: 0, connectionScore: 12, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
];

export const mockMembers: TribeMember[] = [
  // Existing seed member
  { id: 'user1', name: 'Alice Wonderland', avatar: '/seed/avatar-default.svg', dataAiHint: 'avatar person', tribeId: '1', role: 'speaker', reputationStatus: 'Veteran' },
  // Welcome tribe founder + broader membership for testing
  { id: 'dustin', name: 'Dustin Moore', tribeId: '0', role: 'founder', reputationStatus: 'Veteran' },
  { id: 'dustin', name: 'Dustin Moore', tribeId: '1', role: 'member', reputationStatus: 'Veteran' },
  { id: 'dustin', name: 'Dustin Moore', tribeId: '2', role: 'member', reputationStatus: 'Veteran' },
  { id: 'dustin', name: 'Dustin Moore', tribeId: '3', role: 'member', reputationStatus: 'Veteran' },
  // Dev login users — authorAE (mock current user / Creator)
  { id: 'authorAE', name: 'Alice Example', tribeId: '1', role: 'founder', reputationStatus: 'Active' },
  { id: 'authorAE', name: 'Alice Example', tribeId: '3', role: 'speaker', reputationStatus: 'Active' },
  { id: 'authorAE', name: 'Alice Example', tribeId: '6', role: 'founder', reputationStatus: 'Active' },
  { id: 'authorAE', name: 'Alice Example', tribeId: '7', role: 'speaker', reputationStatus: 'Active' },
  // Dev login — test-service-admin (Platform Admin — has global access)
  { id: 'test-service-admin', name: 'Test Service Admin', tribeId: '1', role: 'founder', reputationStatus: 'Veteran' },
  { id: 'test-service-admin', name: 'Test Service Admin', tribeId: '3', role: 'founder', reputationStatus: 'Veteran' },
  { id: 'test-service-admin', name: 'Test Service Admin', tribeId: '6', role: 'founder', reputationStatus: 'Veteran' },
  { id: 'test-service-admin', name: 'Test Service Admin', tribeId: '7', role: 'founder', reputationStatus: 'Veteran' },
  // Dev login — test-service-member
  { id: 'test-service-member', name: 'TSM', tribeId: '1', role: 'speaker', reputationStatus: 'Active' },
  { id: 'test-service-member', name: 'TSM', tribeId: '3', role: 'speaker', reputationStatus: 'Active' },
  { id: 'test-service-member', name: 'TSM', tribeId: '6', role: 'speaker', reputationStatus: 'Active' },
  { id: 'test-service-member', name: 'TSM', tribeId: '7', role: 'speaker', reputationStatus: 'Active' },
  // Dev login — test-speaker-user (Speaker role — moderator/representative)
  { id: 'test-speaker-user', name: 'Speaker Sam', tribeId: '1', role: 'speaker', reputationStatus: 'Trusted' },
  { id: 'test-speaker-user', name: 'Speaker Sam', tribeId: '2', role: 'speaker', reputationStatus: 'Trusted' },
  { id: 'test-speaker-user', name: 'Speaker Sam', tribeId: '3', role: 'speaker', reputationStatus: 'Trusted' },
  { id: 'test-speaker-user', name: 'Speaker Sam', tribeId: '6', role: 'member', reputationStatus: 'Active' },
  // Other tribe post authors — so they're real members of the tribes they post in
  { id: 'authorXY', name: 'AI Ethicist', tribeId: '1', role: 'member', reputationStatus: 'Active' },
  { id: 'authorRD', name: 'RockstarDev', tribeId: '3', role: 'member', reputationStatus: 'Active' },
];

export const mockPendingMembers: PendingMember[] = [
    { id: 'pending1', name: 'Frank Frankenstein', avatar: '/seed/avatar-default.svg', dataAiHint: 'avatar character', requestTimestamp: new Date(), tribeId: '1' },
];

export const mockStoryTopics: StoryTopic[] = [
  {
    id: "story1",
    title: "Understanding the New Local Recycling Program",
    summary: "City recycling changes.",
    category: "local",
    lastUpdatedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 1),
    coverImage: "/seed/post-landscape.svg",
    dataAiHintCover: "recycling bins",
    discussionCount: 12,
    curator: "EcoSpeaker Alex",
    curatorAvatar: "/seed/avatar-default.svg",
    curatorAvatarFallback: "EA",
    dataAiHintCuratorAvatar: "env person",
  },
];

export const mockArticlesForStory: Record<string, SourceArticle[]> = {
  "story1": [
    { id: "art1-1", title: "City Announces New Recycling Pickup Schedule", url: "#", sourceName: "City Herald", publishedDate: new Date(MOCK_POST_DATE_MS), dataAiHint: "news" },
  ],
};

export const mockCommentsForStory: Record<string, DiscussionComment[]> = {
  "story1": [
    { id: "com1-1", authorId: "userA", authorName: "GreenThumb", authorAvatarFallback: "GT", content: "Great clarity!", timestamp: new Date(MOCK_POST_DATE_MS), vibes: 5, dataAiHintAvatar: "gardener" },
  ],
};

// ---- Event Stream Posts (seeded per-event) ----
export interface EventStreamPostSeed {
  id: string;
  eventId: string;
  authorId: string;
  authorNickname: string;
  authorAvatarFallback: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
  timestamp: Date;
}

export const mockEventStreamPosts: EventStreamPostSeed[] = [
  {
    id: "evp1", eventId: "event2", authorId: "user456",
    authorNickname: "EventOrganizer", authorAvatarFallback: "EO",
    content: "Welcome to 'Tech Innovators Summit'! We're thrilled to have you. Check the schedule for today's keynote at 10 AM.",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 2),
  },
  {
    id: "evp2", eventId: "event2", authorId: "authorXY",
    authorNickname: "AI_Explorer_77", authorAvatarFallback: "AI",
    content: "Excited for the AI ethics panel! Anyone know if there will be a Q&A session afterwards?",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 1.5),
  },
  {
    id: "evp3", eventId: "event2", authorId: "user456",
    authorNickname: "EventOrganizer", authorAvatarFallback: "EO",
    content: "Quick update: The workshop on 'Next-Gen AI Tools' in Room B is starting in 15 minutes.",
    imageUrl: "/seed/event-banner.svg",
    imageAlt: "Workshop reminder banner",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 1),
  },
  {
    id: "evp4", eventId: "event2", authorId: "authorRD",
    authorNickname: "DevDude_Online", authorAvatarFallback: "DD",
    content: "Is anyone else having trouble connecting to the event Wi-Fi? SSID: EventGuest",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 0.5),
  },
  {
    id: "evp5", eventId: "event1", authorId: "user123",
    authorNickname: "GigGoer", authorAvatarFallback: "GG",
    content: "Sound check is happening now! 🎶 The main stage setup looks incredible this year.",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 3),
  },
  {
    id: "evp6", eventId: "event1", authorId: "authorGG",
    authorNickname: "MusicFan", authorAvatarFallback: "MF",
    content: "Who else is pumped for the headliner tonight? See you at the front row!",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 2),
  },
];
