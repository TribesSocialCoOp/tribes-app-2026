
import type { UserRole, Event, Bond, TribePost, ReportedPost, DiscussionComment, TribeMember, PendingMember, MoodStreamPost, UserProfile, Tribe, StoryTopic, SourceArticle } from '@/lib/types';

// Mock data moved from data.ts
export const tribesData: Tribe[] = [
  { id: "0", name: "The Trials", description: "Welcome to Tribes.app! Complete the trials in this hub to build your starting reputation and unlock the full platform experience.", members: 9999, isPublic: true, cover: "/seed/tribe-trials.svg", dataAiHint: "start trial guide", moods: ["learn"], homepageUrl: "https://tribes.app/help", joinMechanism: 'instant' },
  { id: "1", name: "AI Innovators", description: "Exploring the future of artificial intelligence and machine learning. Professional networking and project discussions.", members: 128, isPublic: true, cover: "/seed/tribe-ai.svg", dataAiHint: "technology innovation", moods: ["focus", "learn"], homepageUrl: "https://innovate.ai", joinMechanism: 'approval', minimumReputation: 'Active', minimumAccountAgeDays: 30 },
  { id: "2", name: "Weekend Hikers Club", description: "Sharing trails, tips, and breathtaking views from our adventures in nature.", members: 76, isPublic: true, cover: "/seed/tribe-hiking.svg", dataAiHint: "nature mountain", moods: ["discover", "connect"], joinMechanism: 'instant' },
  { id: "3", name: "Indie Game Devs", description: "A community for indie game developers to collaborate, share projects, and find local playtesters.", members: 245, isPublic: false, cover: "/seed/tribe-games.svg", dataAiHint: "gaming development", moods: ["showcase", "game", "learn"], homepageUrl: "https://indiegamedev.guild", joinMechanism: 'instant' },
  { id: "4", name: "Local Bookworms", description: "Discussing our favorite reads and discovering new authors together. Regular meetups.", members: 55, isPublic: true, cover: "/seed/tribe-books.svg", dataAiHint: "reading library", moods: ["learn", "chill", "connect"], joinMechanism: 'approval' },
  { id: "5", name: "Sustainable Living Hub", description: "Tips and discussions on eco-friendly practices and sustainability projects.", members: 92, isPublic: true, cover: "/seed/tribe-gardeners.svg", dataAiHint: "nature environment", moods: ["learn", "discover"], joinMechanism: 'instant' },
  { id: "6", name: "Family Hub", description: "A private space for our family to connect, share updates, and plan events.", members: 15, isPublic: false, cover: "/seed/tribe-parents.svg", dataAiHint: "family home", moods: ["connect"], joinMechanism: 'approval' },
  { id: "7", name: "The Local Gig Circuit", description: "Discover and discuss live music, local bands, and upcoming shows in our city. Connect with fellow music lovers.", members: 88, isPublic: true, cover: "/seed/tribe-music.svg", dataAiHint: "live music concert", moods: ["discover", "connect", "showcase"], joinMechanism: 'instant' },
  { id: "8", name: "Artisan Alley Collective", description: "A space for creators, makers, and artists to share their work, find pop-up opportunities, and support each other.", members: 150, isPublic: true, cover: "/seed/tribe-makerspace.svg", dataAiHint: "crafts art market", moods: ["showcase", "shop", "connect"], joinMechanism: 'approval', minimumReputation: 'Newcomer', minimumAccountAgeDays: 7 },
  { id: "9", name: "Open Mic Night Crew", description: "For performers (comedy, poetry, music) and fans of open mic nights. Share your material, find venues, and connect.", members: 62, isPublic: true, cover: "/seed/tribe-filmmakers.svg", dataAiHint: "performance comedy poetry", moods: ["showcase", "discover", "connect"], joinMechanism: 'instant' },
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
  aliases: ["WonderlandCoder", "HikerGal", "PixelPioneer"],
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

const MOCK_POST_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();
export const initialSampleTribePosts: TribePost[] = [
  {
    id: "trial_post_1", tribeId: "0", authorId: "system", authorName: "T-Codex Prime", authorAvatarFallback: "AI",
    timestamp: new Date(MOCK_POST_DATE_MS),
    title: "Welcome, Initiate! Your First Trial: Introductions",
    content: "Welcome to Tribes.app! Your journey starts here.",
    vibes: 1, comments: 0, dataAiHintAvatar: "robot mascot",
    isPinned: true,
  },
];

export const allMoodStreamPosts: MoodStreamPost[] = [
  {
    id: "msp1",
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
  { id: "1", targetName: "AI Innovators Tribe", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_POST_DATE_MS - 86400000 * 30), expiresAt: new Date(MOCK_POST_DATE_MS + 86400000 * (30)), reconnectsCount: 2, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
];

export const mockMembers: TribeMember[] = [
  // Existing seed member
  { id: 'user1', name: 'Alice Wonderland', avatar: '/seed/avatar-default.svg', dataAiHint: 'avatar person', tribeId: '1', role: 'speaker', reputationStatus: 'Veteran' },
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
