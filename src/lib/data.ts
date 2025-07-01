import type { UserRole, Event } from '@/lib/types';
import type { MoodStreamPost } from '@/app/(app)/moods/[moodSlug]/page';
import { allMoodStreamPosts } from '@/app/(app)/moods/[moodSlug]/page';

export interface Tribe {
  id: string;
  name: string;
  description: string;
  members: number;
  isPublic: boolean;
  cover: string;
  dataAiHint: string;
  moods?: string[];
  homepageUrl?: string;
  joinMechanism?: 'instant' | 'approval';
}

// Changed from const to let to allow mutation for mock data simulation
export let tribesData: Tribe[] = [
  { id: "1", name: "AI Innovators", description: "Exploring the future of artificial intelligence and machine learning. Professional networking and project discussions.", members: 128, isPublic: true, cover: "https://placehold.co/400x200.png?text=AI" , dataAiHint: "technology innovation", moods: ["focus", "learn"], homepageUrl: "https://innovate.ai", joinMechanism: 'approval' },
  { id: "2", name: "Weekend Hikers Club", description: "Sharing trails, tips, and breathtaking views from our adventures in nature.", members: 76, isPublic: true, cover: "https://placehold.co/400x200.png?text=Hiking" , dataAiHint: "nature mountain", moods: ["discover", "connect"], joinMechanism: 'instant' },
  { id: "3", name: "Indie Game Devs", description: "A community for indie game developers to collaborate, share projects, and find local playtesters.", members: 245, isPublic: false, cover: "https://placehold.co/400x200.png?text=Games" , dataAiHint: "gaming development", moods: ["showcase", "game", "learn"], homepageUrl: "https://indiegamedev.guild", joinMechanism: 'instant' },
  { id: "4", name: "Local Bookworms", description: "Discussing our favorite reads and discovering new authors together. Regular meetups.", members: 55, isPublic: true, cover: "https://placehold.co/400x200.png?text=Books" , dataAiHint: "reading library", moods: ["learn", "chill", "connect"], joinMechanism: 'approval' },
  { id: "5", name: "Sustainable Living Hub", description: "Tips and discussions on eco-friendly practices and sustainability projects.", members: 92, isPublic: true, cover: "https://placehold.co/400x200.png?text=Eco" , dataAiHint: "nature environment", moods: ["learn", "discover"], joinMechanism: 'instant' },
  { id: "6", name: "Family Hub", description: "A private space for our family to connect, share updates, and plan events.", members: 15, isPublic: false, cover: "https://placehold.co/400x200.png?text=Family", dataAiHint: "family home", moods: ["connect"], joinMechanism: 'approval' },
  { id: "7", name: "The Local Gig Circuit", description: "Discover and discuss live music, local bands, and upcoming shows in our city. Connect with fellow music lovers.", members: 88, isPublic: true, cover: "https://placehold.co/400x200.png?text=MusicShows", dataAiHint: "live music concert", moods: ["discover", "connect", "showcase"], joinMechanism: 'instant' },
  { id: "8", name: "Artisan Alley Collective", description: "A space for creators, makers, and artists to share their work, find pop-up opportunities, and support each other.", members: 150, isPublic: true, cover: "https://placehold.co/400x200.png?text=Artisans", dataAiHint: "crafts art market", moods: ["showcase", "shop", "connect"], joinMechanism: 'approval' },
  { id: "9", name: "Open Mic Night Crew", description: "For performers (comedy, poetry, music) and fans of open mic nights. Share your material, find venues, and connect.", members: 62, isPublic: true, cover: "https://placehold.co/400x200.png?text=OpenMic", dataAiHint: "performance comedy poetry", moods: ["showcase", "discover", "connect"], joinMechanism: 'instant' },
];

/**
 * A mock of the currently logged-in user's role.
 * Change this to 'Admin', 'Creator', 'Human_Member', or 'Human_Free' to test role-based UI.
 */
export const MOCK_USER_ROLE: UserRole = 'Creator';
export const MOCK_CURRENT_USER_ID = "authorAE"; // Alice Example is our test user


// --- Centralized Mock Data for Events, Posts, Reports, etc. ---

const MOCK_EVENT_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();
// Changed from const to let to allow mutation for mock data simulation
export let sampleEventsData: Event[] = [
  {
    id: "event1",
    name: "Summer Music Festival Kick-off",
    keywords: "Live Music, Outdoor, Summer, Festival",
    description: "Join us for the grand opening of the Summer Music Festival! Featuring top local bands, food trucks, and amazing vibes. Don't miss out on the biggest party of the summer. Get ready to dance and celebrate with us under the stars. This is an event you won't want to miss, filled with great music and fun for everyone.",
    eventDate: new Date(MOCK_EVENT_DATE_MS + 86400000 * 30), // Approx 30 days from now
    associatedTribe: "The Local Gig Circuit", // Matches Tribe Name
    coverImage: "https://placehold.co/1200x400.png",
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
    description: "A deep dive into the latest advancements in Artificial Intelligence. Network with industry leaders, attend insightful workshops, and discover the future of tech. This summit is perfect for developers, researchers, and tech enthusiasts.",
    eventDate: new Date(MOCK_EVENT_DATE_MS + 86400000 * 60), // Approx 60 days from now
    associatedTribe: "AI Innovators", // Matches Tribe Name
    coverImage: "https://placehold.co/1200x400.png",
    dataAiHintCover: "technology conference abstract",
    isPublic: true,
    creatorId: "user456",
    locationName: "Grand Tech Convention Center",
    locationCityRegion: "New York, NY",
    latitude: 40.7128,
    longitude: -74.0060,
  },
  {
    id: "event3",
    name: "Artisan Craft Fair - Members Preview",
    keywords: "Crafts, Art, Local, Shopping",
    description: "A special preview night for members of the Artisan Alley Collective. Get first dibs on unique handmade items before the public opening. Support local artists and find beautiful crafts. Light refreshments will be served.",
    eventDate: new Date(MOCK_EVENT_DATE_MS + 86400000 * 15), // Approx 15 days from now
    associatedTribe: "Artisan Alley Collective", // Matches Tribe Name
    // No cover image for this one
    isPublic: false, // Private event
    creatorId: "user789",
    locationName: "The Artful Space Gallery",
    locationCityRegion: "Portland, OR",
    latitude: 45.5051,
    longitude: -122.6750,
  },
  {
    id: "event4",
    name: "AI Ethics Debate Night",
    keywords: "AI, Ethics, Discussion, Debate",
    description: "Join AI Innovators for a lively debate on the ethical implications of current AI trends. Featuring guest speakers and an open Q&A session.",
    eventDate: new Date(MOCK_EVENT_DATE_MS + 86400000 * 40), 
    associatedTribe: "AI Innovators", // Another event for AI Innovators
    coverImage: "https://placehold.co/1200x400.png",
    dataAiHintCover: "debate discussion abstract",
    isPublic: true,
    creatorId: "user456",
    locationName: "University Lecture Hall B",
    locationCityRegion: "Cambridge, MA",
    latitude: 42.3736,
    longitude: -71.1097,
  },
];


export interface TribePost {
  id: string;
  tribeId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  timestamp: Date;
  title?: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
  vibes?: number;
  comments?: number;
  isRemoved?: boolean;
  canBeReposted?: boolean;
  removalReason?: string;
  originalPostId?: string;
}

const MOCK_POST_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();

export let initialSampleTribePosts: TribePost[] = [
  {
    id: "tribe_post_ai_local1", tribeId: "1", authorId: "authorXY", authorName: "AI Ethicist", authorAvatarFallback: "AE",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 2),
    title: "Local Discussion: Ethics in AI Development",
    content: "Starting a thread specifically for our tribe members on the ethical considerations of recent AI breakthroughs. What are your immediate thoughts?",
    vibes: 30, comments: 5, dataAiHintAvatar: "researcher scientist",
    isRemoved: false, 
    canBeReposted: true,
  },
  {
    id: "msp2", tribeId: "1", authorId: MOCK_CURRENT_USER_ID, authorName: "ProductivePro (You)", authorAvatarFallback: "PP",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 3),
    title: "My Top 5 Productivity Hacks for Deep Work",
    content: "Sharing my secrets to staying in the zone! Tip #1: Time blocking is key. This was also shared to the Focus mood stream.",
    imageUrl: "https://placehold.co/600x400.png?text=FocusHacks", imageAlt: "Productivity hacks", dataAiHintImage: "productivity office",
    vibes: 125, comments: 18, dataAiHintAvatar: "work professional",
    isRemoved: true, 
    canBeReposted: true, 
    removalReason: "Content marked as removed by admin. Eligible for reposting.",
  },
  {
    id: "tribe_post_hikers_local1", tribeId: "2", authorId: "authorTB", authorName: "Trail Blazer", authorAvatarFallback: "TB",
    timestamp: new Date(MOCK_POST_DATE_MS - 86400000 * 1),
    title: "Weekend Hike Recap: Mountain Peak (Tribe Exclusive Pics)",
    content: "The views from Mountain Peak trail were absolutely stunning this weekend! Sharing some extra photos just for our tribe. Highly recommend this route.",
    imageUrl: "https://placehold.co/600x450.png", imageAlt: "Mountain landscape", dataAiHintImage: "mountain landscape",
    vibes: 210, comments: 32, dataAiHintAvatar: "hiker adventurer",
  },
   {
    id: "msp9", tribeId: "2", authorId: "authorLF", authorName: "LocalFoodie", authorAvatarFallback: "LF",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 7),
    title: "Post-Hike Find: Amazing Farmers Market!",
    content: "After our hike near Miller's Pond, stumbled upon this fantastic farmers market. Great fuel and cool local crafts! Shared this to Discover stream too.",
    imageUrl: "https://placehold.co/600x420.png", imageAlt: "Farmers market produce", dataAiHintImage: "market food",
    vibes: 85, comments: 12, dataAiHintAvatar: "foodie person",
  },
  {
    id: "tribe_post_music_local1", tribeId: "7", authorId: "authorGG", authorName: "GigGoer", authorAvatarFallback: "GG",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 1),
    title: "Last Night's Show Was Epic! (Tribe Thoughts)",
    content: "The Local Band absolutely crushed it at The Underground! What did our tribe members think of the new songs?",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Concert crowd", dataAiHintImage: "concert crowd",
    vibes: 95, comments: 22, dataAiHintAvatar: "music fan",
  },
  {
    id: "msp8", tribeId: "7", authorId: "authorRD", authorName: "RockstarDev", authorAvatarFallback: "RD",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 8),
    title: "My Stage Setup for Tonight's Gig",
    content: "Sound check done! Ready to rock the 'Music Hall' tonight. Who's coming? Also shared to Create mood stream!",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Stage setup with instruments", dataAiHintImage: "stage music",
    vibes: 150, comments: 18, dataAiHintAvatar: "musician band",
  },
  {
    id: "post7", tribeId: "3", authorId: "authorDQ", authorName: "DevQuest", authorAvatarFallback: "DQ",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 3),
    title: "Seeking Beta Testers for New Puzzle Game (Tribe Only)",
    content: "Our indie studio is looking for beta testers for our upcoming mobile puzzle game 'Color Grid'. DM me if you're interested! This is a private post for tribe members.",
    vibes: 40, comments: 5, dataAiHintAvatar: "game developer",
    isRemoved: true, // Test case for a removed post that cannot be reposted by default.
    canBeReposted: false,
    removalReason: "Content removed due to policy violation (Simulated). Reposting not allowed."
  },
];

export const moodStreamPostIds = new Set(allMoodStreamPosts.map(p => p.id));

export interface ReportedPost {
  postId: string;
  postTitle?: string;
  reporterName: string;
  reportedAt: Date;
  reason?: string;
}

export let mockReportedContentData: ReportedPost[] = [
  { postId: "msp2", postTitle: "My Top 5 Productivity Hacks for Deep Work", reporterName: "ConcernedUser42", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "This post seems off-topic for the AI Innovators tribe." },
  { postId: "tribe_post_hikers_local1", postTitle: "Weekend Hike Recap: Mountain Peak (Tribe Exclusive Pics)", reporterName: "SafetyFirst", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "Sharing potentially dangerous trail info without proper warnings." },
  { postId: "tribe_post_ai_local1", postTitle: "Local Discussion: Ethics in AI Development", reporterName: "RuleFollower99", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 0.5), reason: "A standard report for a non-removed item, to test queue visibility." },
  { postId: "post7", postTitle: "Seeking Beta Testers for New Puzzle Game (Tribe Only)", reporterName: "QualityAssuranceBot", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "Post content violated beta testing guidelines." }
];

export interface DiscussionComment {
  id:string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  content: string;
  timestamp: Date;
  vibes?: number;
  replies?: DiscussionComment[];
  dataAiHintAvatar?: string;
}

const MOCK_COMMENT_DATE_MS = new Date("2025-07-15T12:00:00.000Z").getTime();

export let mockCommentsForStory: Record<string, DiscussionComment[]> = {
  "story1": [
    { id: "com1-1", authorId: "userA", authorName: "GreenThumb", authorAvatarFallback: "GT", content: "Finally, some clarity on the new schedule! Thanks for sharing.", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 2), vibes: 5, dataAiHintAvatar: "gardener person" },
    { id: "com1-2", authorId: "userB", authorName: "CityDweller", authorAvatarFallback: "CD", content: "I'm still confused about plastics #5. Are they accepted now or not?", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 1), vibes: 2, replies: [
      { id: "com1-2-1", authorId: "userA", authorName: "GreenThumb", authorAvatarFallback: "GT", content: "I think it depends on the specific item, best to check the city's website directly.", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 0.5), vibes: 1, dataAiHintAvatar: "gardener person"},
    ], dataAiHintAvatar: "urban resident" },
  ],
  "story2": [
     { id: "com2-1", authorId: "userC", authorName: "PolicyWonk", authorAvatarFallback: "PW", content: "The long-term fiscal implications of UBI are still the biggest question mark for me.", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 5), vibes: 10, dataAiHintAvatar: "researcher suit"},
  ],
};
