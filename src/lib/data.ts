
import type { UserRole, Event, Bond, TribePost, ReportedPost, DiscussionComment, TribeMember, PendingMember, MoodStreamPost, UserProfile } from '@/lib/types';

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
  minimumReputation?: UserProfile['reputationStatus'];
}

// Changed from const to let to allow mutation for mock data simulation
export let tribesData: Tribe[] = [
  { id: "0", name: "The Trials", description: "Welcome to Tribes.app! Complete the trials in this hub to build your starting reputation and unlock the full platform experience.", members: 9999, isPublic: true, cover: "https://placehold.co/400x200.png?text=Trials" , dataAiHint: "start trial guide", moods: ["learn"], homepageUrl: "https://tribes.app/help", joinMechanism: 'instant' },
  { id: "1", name: "AI Innovators", description: "Exploring the future of artificial intelligence and machine learning. Professional networking and project discussions.", members: 128, isPublic: true, cover: "https://placehold.co/400x200.png?text=AI" , dataAiHint: "technology innovation", moods: ["focus", "learn"], homepageUrl: "https://innovate.ai", joinMechanism: 'approval', minimumReputation: 'Good' },
  { id: "2", name: "Weekend Hikers Club", description: "Sharing trails, tips, and breathtaking views from our adventures in nature.", members: 76, isPublic: true, cover: "https://placehold.co/400x200.png?text=Hiking" , dataAiHint: "nature mountain", moods: ["discover", "connect"], joinMechanism: 'instant' },
  { id: "3", name: "Indie Game Devs", description: "A community for indie game developers to collaborate, share projects, and find local playtesters.", members: 245, isPublic: false, cover: "https://placehold.co/400x200.png?text=Games" , dataAiHint: "gaming development", moods: ["showcase", "game", "learn"], homepageUrl: "https://indiegamedev.guild", joinMechanism: 'instant' },
  { id: "4", name: "Local Bookworms", description: "Discussing our favorite reads and discovering new authors together. Regular meetups.", members: 55, isPublic: true, cover: "https://placehold.co/400x200.png?text=Books" , dataAiHint: "reading library", moods: ["learn", "chill", "connect"], joinMechanism: 'approval' },
  { id: "5", name: "Sustainable Living Hub", description: "Tips and discussions on eco-friendly practices and sustainability projects.", members: 92, isPublic: true, cover: "https://placehold.co/400x200.png?text=Eco" , dataAiHint: "nature environment", moods: ["learn", "discover"], joinMechanism: 'instant' },
  { id: "6", name: "Family Hub", description: "A private space for our family to connect, share updates, and plan events.", members: 15, isPublic: false, cover: "https://placehold.co/400x200.png?text=Family", dataAiHint: "family home", moods: ["connect"], joinMechanism: 'approval' },
  { id: "7", name: "The Local Gig Circuit", description: "Discover and discuss live music, local bands, and upcoming shows in our city. Connect with fellow music lovers.", members: 88, isPublic: true, cover: "https://placehold.co/400x200.png?text=MusicShows", dataAiHint: "live music concert", moods: ["discover", "connect", "showcase"], joinMechanism: 'instant' },
  { id: "8", name: "Artisan Alley Collective", description: "A space for creators, makers, and artists to share their work, find pop-up opportunities, and support each other.", members: 150, isPublic: true, cover: "https://placehold.co/400x200.png?text=Artisans", dataAiHint: "crafts art market", moods: ["showcase", "shop", "connect"], joinMechanism: 'approval', minimumReputation: 'Fair' },
  { id: "9", name: "Open Mic Night Crew", description: "For performers (comedy, poetry, music) and fans of open mic nights. Share your material, find venues, and connect.", members: 62, isPublic: true, cover: "https://placehold.co/400x200.png?text=OpenMic", dataAiHint: "performance comedy poetry", moods: ["showcase", "discover", "connect"], joinMechanism: 'instant' },
];

/**
 * A mock of the currently logged-in user's role.
 * Change this to 'Admin', 'Creator', 'Human_Member', or 'Human_Free' to test role-based UI.
 */
export const MOCK_USER_ROLE: UserRole = 'Human_Free';
export const MOCK_CURRENT_USER_ID = "authorAE"; // Alice Example is our test user

export let mockUserProfile: UserProfile = {
  id: MOCK_CURRENT_USER_ID,
  name: "Alice Example",
  email: "alice@example.com",
  role: MOCK_USER_ROLE,
  bio: "Lover of tech, hiking, and indie games.",
  avatar: "https://placehold.co/100x100.png",
  aliases: ["WonderlandCoder", "HikerGal", "PixelPioneer"],
  reputationScore: 50, // New users start with a low score
  reputationStatus: 'Onboarding', // New users start in onboarding
};


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

const MOCK_POST_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();

export let initialSampleTribePosts: TribePost[] = [
  {
    id: "trial_post_1", tribeId: "0", authorId: "system", authorName: "T-Codex Prime", authorAvatarFallback: "AI",
    timestamp: new Date(MOCK_POST_DATE_MS),
    title: "Welcome, Initiate! Your First Trial: Introductions",
    content: "Welcome to Tribes.app! Your journey starts here. The first step to building a solid reputation is to engage constructively.\n\n**Your Task:** Reply to this post and introduce yourself. Tell us what kind of communities you're excited to find or create!",
    vibes: 1, comments: 0, dataAiHintAvatar: "robot mascot",
    isPinned: true,
  },
  {
    id: "trial_post_2", tribeId: "0", authorId: "system", authorName: "T-Codex Prime", authorAvatarFallback: "AI",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600),
    title: "Trial 2: Understanding The Vibe",
    content: "Interactions on Tribes.app are nuanced. You can 'vibe' with posts and comments to show appreciation or agreement. \n\n**Your Task:** Find a reply from another new member in the 'Introductions' thread and give it a 'vibe' you agree with.",
    vibes: 1, comments: 0, dataAiHintAvatar: "robot mascot",
    isPinned: true,
  },
  {
    id: "tribe_post_ai_local1", tribeId: "1", authorId: "authorXY", authorName: "AI Ethicist", authorAvatarFallback: "AE",
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 2),
    title: "Local Discussion: Ethics in AI Development",
    content: "Starting a thread specifically for our tribe members on the ethical considerations of recent AI breakthroughs. What are your immediate thoughts?",
    vibes: 30, comments: 2, dataAiHintAvatar: "researcher scientist",
    commentsData: [
        { id: "comment-ai-1", authorId: "authorAE", authorName: "You (Current User)", authorAvatarFallback: "ME", content: "Great topic. My main concern is data privacy and how these new models are trained.", timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 1.5), vibes: 5, replies: [
            { id: "comment-ai-1-1", authorId: "authorXY", authorName: "AI Ethicist", authorAvatarFallback: "AE", content: "Absolutely. We need more transparency in the training process.", timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 1), vibes: 2, dataAiHintAvatar: "researcher scientist" }
        ], dataAiHintAvatar: "current user" }
    ],
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
    vibes: 210, comments: 0, dataAiHintAvatar: "hiker adventurer",
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
    vibes: 95, comments: 1, dataAiHintAvatar: "music fan",
    commentsData: [
       { id: "comment-music-1", authorId: "authorRD", authorName: "RockstarDev", authorAvatarFallback: "RD", content: "The new single is going to be a hit!", timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 0.5), vibes: 10, dataAiHintAvatar: "musician band" }
    ]
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


export let allMoodStreamPosts: MoodStreamPost[] = [
  {
    id: "msp1",
    title: "The perfect lofi beat for a rainy day",
    content: "Just found this amazing lofi hip hop mix on YouTube. It's been on repeat all morning. Pure bliss and perfect for coding.",
    author: "ChillCoder",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=CC",
    authorAvatarFallback: "CC",
    tribeName: "AI Innovators",
    imageUrl: "https://placehold.co/600x400.png?text=Lofi",
    imageAlt: "Aesthetic image of a desk with a laptop and a cup of coffee on a rainy day",
    moodTags: ["chill", "focus"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000), // 1 hour ago
    vibes: 152,
    comments: 12,
    dataAiHintAvatar: "coder chill",
    dataAiHintImage: "lofi desk",
  },
  {
    id: "msp2",
    title: "My Top 5 Productivity Hacks for Deep Work",
    content: "Sharing my secrets to staying in the zone! Tip #1: Time blocking is key.",
    author: "ProductivePro",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=PP",
    authorAvatarFallback: "PP",
    tribeName: "AI Innovators",
    imageUrl: "https://placehold.co/600x400.png?text=FocusHacks",
    imageAlt: "A well-organized desk with planners and a computer",
    moodTags: ["focus"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 3), // 3 hours ago
    vibes: 125,
    comments: 18,
    dataAiHintAvatar: "work professional",
    dataAiHintImage: "productivity office",
  },
  {
    id: "msp3",
    title: "Finally finished my latest painting!",
    content: "Spent the last month on this piece. It's an abstract acrylic on canvas. What do you all think? Feedback is welcome!",
    author: "ArtsyAnna",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=AA",
    authorAvatarFallback: "AA",
    tribeName: "Artisan Alley Collective",
    imageUrl: "https://placehold.co/600x600.png",
    imageAlt: "Abstract painting with bold colors",
    moodTags: ["showcase"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 5), // 5 hours ago
    vibes: 340,
    comments: 45,
    dataAiHintAvatar: "artist painter",
    dataAiHintImage: "abstract painting",
  },
  {
    id: "msp4",
    title: "New Cafe Downtown - 'The Grind'",
    content: "Has anyone tried the new coffee shop that opened on Main Street? Their espresso is top-notch. Great place to work from.",
    author: "CityExplorer",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=CE",
    authorAvatarFallback: "CE",
    moodTags: ["discover"],
    timestamp: new Date(MOCK_POST_DATE_MS - 86400000), // 1 day ago
    vibes: 98,
    comments: 22,
    dataAiHintAvatar: "explorer urban",
  },
  {
    id: "msp5",
    title: "Planning a community garden project",
    content: "Looking for volunteers to help start a community garden in the North Park area. We have the space, just need the people! Let's connect and make our neighborhood greener.",
    author: "GreenThumb",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=GT",
    authorAvatarFallback: "GT",
    tribeName: "Sustainable Living Hub",
    moodTags: ["connect", "discover"],
    timestamp: new Date(MOCK_POST_DATE_MS - 86400000 * 2), // 2 days ago
    vibes: 215,
    comments: 31,
    dataAiHintAvatar: "gardener community",
  },
  {
    id: "msp6",
    content: "Meditation helps me a lot with coding challenges. Just 10 minutes can clear my head.",
    author: "ZenDev",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=ZD",
    authorAvatarFallback: "ZD",
    moodTags: ["chill", "focus"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 6), // 6 hours ago
    vibes: 78,
    comments: 9,
    dataAiHintAvatar: "meditation developer",
  },
  {
    id: "msp7",
    title: "My Game is on Steam Greenlight!",
    content: "So excited to announce that my indie game 'Pixel Odyssey' is now on Steam Greenlight. Would mean the world if you could check it out and vote!",
    author: "IndieGamerIO",
    authorAvatarSrc: "https://placehold.co/40x40.png?text=IG",
    authorAvatarFallback: "IG",
    tribeName: "Indie Game Devs",
    imageUrl: "https://placehold.co/600x338.png?text=PixelOdyssey",
    imageAlt: "Pixel art landscape from the game Pixel Odyssey",
    moodTags: ["game", "showcase"],
    timestamp: new Date(MOCK_POST_DATE_MS - 86400000 * 3), // 3 days ago
    vibes: 450,
    comments: 88,
    dataAiHintAvatar: "developer gamer",
    dataAiHintImage: "pixel art game",
  },
  {
    id: "msp8",
    title: "My Stage Setup for Tonight's Gig",
    content: "Sound check done! Ready to rock the 'Music Hall' tonight. Who's coming?",
    author: "RockstarDev",
    authorAvatarFallback: "RD",
    tribeName: "The Local Gig Circuit",
    imageUrl: "https://placehold.co/600x380.png",
    imageAlt: "Stage setup with instruments",
    moodTags: ["showcase", "connect"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 8), // 8 hours ago
    vibes: 150,
    comments: 18,
    dataAiHintImage: "stage music",
    dataAiHintAvatar: "musician band"
  },
  {
    id: "msp9",
    title: "Post-Hike Find: Amazing Farmers Market!",
    content: "After our hike near Miller's Pond, stumbled upon this fantastic farmers market. Great fuel and cool local crafts!",
    author: "LocalFoodie",
    authorAvatarFallback: "LF",
    tribeName: "Weekend Hikers Club",
    imageUrl: "https://placehold.co/600x420.png",
    imageAlt: "Farmers market produce",
    moodTags: ["discover"],
    timestamp: new Date(MOCK_POST_DATE_MS - 3600000 * 7), // 7 hours ago
    vibes: 85,
    comments: 12,
    dataAiHintImage: "market food",
    dataAiHintAvatar: "foodie person"
  }
];

export let moodStreamPostIds = new Set(allMoodStreamPosts.map(p => p.id));

export let mockReportedContentData: ReportedPost[] = [
  { postId: "msp2", postTitle: "My Top 5 Productivity Hacks for Deep Work", reporterName: "ConcernedUser42", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "This post seems off-topic for the AI Innovators tribe." },
  { postId: "tribe_post_hikers_local1", postTitle: "Weekend Hike Recap: Mountain Peak (Tribe Exclusive Pics)", reporterName: "SafetyFirst", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "Sharing potentially dangerous trail info without proper warnings." },
  { postId: "tribe_post_ai_local1", postTitle: "Local Discussion: Ethics in AI Development", reporterName: "RuleFollower99", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 0.5), reason: "A standard report for a non-removed item, to test queue visibility." },
  { postId: "post7", postTitle: "Seeking Beta Testers for New Puzzle Game (Tribe Only)", reporterName: "QualityAssuranceBot", reportedAt: new Date(MOCK_POST_DATE_MS - 3600000 * 1), reason: "Post content violated beta testing guidelines." }
];

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

const MOCK_BOND_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();

export let bondsData: Bond[] = [
  { id: "1", targetName: "AI Innovators Tribe", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 30), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (30)), reconnectsCount: 2, showInIntercom: true, allowChatInitiation: false, keyType: "standard", pseudonym: "TechWatcher", tribeAssignedNickname: "SynthMind" },
  { id: "2", targetName: "Alice Wonderland", targetType: "user", bondType: "friend", formationMethod: "rfid_tap", passkeyStatus: "expires_soon", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 5), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 25), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: true, keyType: "standard", pseudonym: "WonderBuddy", targetPseudonymForMe: "MadHatter" },
  { id: "3", targetName: "Weekend Hikers", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "active", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 80), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 10), reconnectsCount: 0, showInIntercom: false, allowChatInitiation: false, keyType: "standard" },
  { id: "4", targetName: "Bob The Builder", targetType: "user", bondType: "professional", formationMethod: "rfid_tap", passkeyStatus: "expired", expiresAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 2), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 62), reconnectsCount: 3, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
  { id: "5", targetName: "Mom", targetType: "user", bondType: "family", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 10), expiresAt: new Date(MOCK_BOND_DATE_MS + 365 * 86400000), reconnectsCount: 5, showInIntercom: true, allowChatInitiation: true, keyType: "standard" },
  { id: "6", targetName: "Design Masters", targetType: "tribe", bondType: "professional", formationMethod: "rfid_tap", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 180), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (30)), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: false, keyType: "standard", pseudonym: "PixelPusher", tribeAssignedNickname: "The Visionary" },
  { id: "7", targetName: "Project Collab", targetType: "tribe", bondType: "collaborator", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 15), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 15), reconnectsCount: 7, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
  { id: "8", targetName: "Art Patronage Inc.", targetType: "tribe", bondType: "supporter", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 15), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (45)), reconnectsCount: 4, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
  { id: "9", targetName: "Book Club Collective", targetType: "tribe", bondType: "follower", formationMethod: "rfid_tap", passkeyStatus: "expires_soon", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 12), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 18), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: true, keyType: "standard" },
  { id: "10", targetName: "John Doe (Dev)", targetType: "user", bondType: "collaborator", formationMethod: "rfid_tap", passkeyStatus: "needs_refresh", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 90), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (30)), reconnectsCount: 10, showInIntercom: false, allowChatInitiation: false, keyType: "standard", pseudonym: "CodeNinja", targetPseudonymForMe: "TheArchitect" },
  { id: "11", targetName: "Charlie Chaplin", targetType: "user", bondType: "friend", formationMethod: "rfid_tap", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 5), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (25)), reconnectsCount: 2, showInIntercom: true, allowChatInitiation: true, keyType: "standard" },
  { id: "12", targetName: "David Copperfield", targetType: "user", bondType: "collaborator", formationMethod: "digital_introduction", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 2), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (28)), reconnectsCount: 0, showInIntercom: true, allowChatInitiation: true, keyType: "standard" },
  { id: "13", targetName: "Emily Elephant", targetType: "user", bondType: "professional", formationMethod: "rfid_tap", passkeyStatus: "expires_soon", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 3), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 27), reconnectsCount: 1, showInIntercom: false, allowChatInitiation: true, keyType: "standard" },
  { id: "14", targetName: "Fiona Fox", targetType: "user", bondType: "follower", formationMethod: "virtual_request", passkeyStatus: "active", lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 10), expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * (20)), reconnectsCount: 0, showInIntercom: true, allowChatInitiation: true, keyType: "standard" },
  { id: "15", targetName: "George Gorilla", targetType: "user", bondType: "friend", formationMethod: "rfid_tap", passkeyStatus: "expired", expiresAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 5), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS - 86400000 * 35), reconnectsCount: 5, showInIntercom: true, allowChatInitiation: false, keyType: "standard" },
  { id: "16", targetName: "Summer Fest Pass", targetType: "user", bondType: "follower", formationMethod: "virtual_request", keyType: "event_promo", eventId: "summerfest2024", accessTier: "spectator", passkeyStatus: "active", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 60), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS), reconnectsCount: 0, showInIntercom: true, allowChatInitiation: false },
  { id: "17", targetName: "Concert VIP Access", targetType: "user", bondType: "supporter", formationMethod: "rfid_tap", keyType: "event_attendee", eventId: "bandlive2024", accessTier: "vip", passkeyStatus: "active", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 1), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS), reconnectsCount: 1, showInIntercom: true, allowChatInitiation: true },
  { id: "18", targetName: "Tech Conference Day Pass", targetType: "user", bondType: "professional", formationMethod: "rfid_tap", keyType: "event_attendee", eventId: "devcon2024", accessTier: "attendee", passkeyStatus: "active", expiresAt: new Date(MOCK_BOND_DATE_MS + 86400000 * 0.5), lastRefreshedAt: new Date(MOCK_BOND_DATE_MS), reconnectsCount: 0, showInIntercom: false, allowChatInitiation: false },
];

export let mockMembers: TribeMember[] = [
  { id: 'user1', name: 'Alice Wonderland', avatar: 'https://placehold.co/40x40.png?text=AW', dataAiHint: 'avatar person', tribeId: '1', role: 'speaker', tribeAssignedNickname: 'AI Lead', reputationStatus: 'Excellent' },
  { id: 'user2', name: 'Bob The Builder', avatar: 'https://placehold.co/40x40.png?text=BB', dataAiHint: 'avatar character', tribeId: '1', role: 'member', reputationStatus: 'Good' },
  { id: 'user3', name: 'Charlie Chaplin', avatar: 'https://placehold.co/40x40.png?text=CC', dataAiHint: 'avatar person', tribeId: '1', role: 'member', reputationStatus: 'Fair' },
  { id: 'user4', name: 'Diana Prince', avatar: 'https://placehold.co/40x40.png?text=DP', dataAiHint: 'avatar hero', tribeId: '2', role: 'member', reputationStatus: 'Good' },
  { id: 'user5', name: 'Edward Elric', avatar: 'https://placehold.co/40x40.png?text=EE', dataAiHint: 'avatar anime', tribeId: '2', role: 'member', tribeAssignedNickname: 'Trail Master', reputationStatus: 'Poor' },
  { id: 'user6', name: 'Fiona Glenanne', avatar: 'https://placehold.co/40x40.png?text=FG', dataAiHint: 'avatar agent', tribeId: '3', role: 'member', reputationStatus: 'At Risk' },
];

export let mockPendingMembers: PendingMember[] = [
    { id: 'pending1', name: 'Frank Frankenstein', avatar: 'https://placehold.co/40x40.png?text=FF', dataAiHint: 'avatar character', requestTimestamp: new Date(), tribeId: '1' },
    { id: 'pending2', name: 'Grace Hopper', avatar: 'https://placehold.co/40x40.png?text=GH', dataAiHint: 'avatar scientist', requestTimestamp: new Date(new Date().getTime() - 86400000), tribeId: '1' },
];

// --- OUR STORY MOCK DATA ---
export interface StoryTopic {
  id: string;
  title: string;
  summary: string;
  category: 'local' | 'national' | 'global';
  lastUpdatedAt: Date;
  coverImage?: string;
  dataAiHintCover?: string;
  relatedLinks?: { title: string, url: string }[];
  discussionCount?: number;
  curator?: string;
  curatorAvatar?: string;
  curatorAvatarFallback?: string;
  dataAiHintCuratorAvatar?: string;
}

export interface SourceArticle {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedDate: Date;
  summarySnippet?: string;
  dataAiHint?: string;
}

const MOCK_STORY_DATE_MS = new Date("2025-07-15T10:00:00.000Z").getTime();

export let mockStoryTopics: StoryTopic[] = [
  {
    id: "story1",
    title: "Understanding the New Local Recycling Program",
    summary: "Recent changes to our city's recycling program have many residents asking questions. This topic aims to consolidate official information, community discussions, and tips for effective participation.",
    category: "local",
    lastUpdatedAt: new Date(MOCK_STORY_DATE_MS - 86400000 * 1), // 1 day ago
    coverImage: "https://placehold.co/600x400.png",
    dataAiHintCover: "recycling bins community",
    relatedLinks: [
      { title: "City Council Announcement", url: "#" },
      { title: "Community Forum Thread", url: "#" },
    ],
    discussionCount: 12,
    curator: "EcoSpeaker Alex",
    curatorAvatar: "https://placehold.co/40x40.png?text=EA",
    curatorAvatarFallback: "EA",
    dataAiHintCuratorAvatar: "environment person",
  },
  {
    id: "story2",
    title: "National Debate on Universal Basic Income: Pros &amp; Cons",
    summary: "A comprehensive overview of the ongoing national discussion around UBI, featuring arguments from leading economists, social scientists, and policymakers. Explore the potential impacts and challenges.",
    category: "national",
    lastUpdatedAt: new Date(MOCK_STORY_DATE_MS - 86400000 * 3), // 3 days ago
    coverImage: "https://placehold.co/600x400.png",
    dataAiHintCover: "debate discussion money",
    discussionCount: 45,
    curator: "PolicySpeaker Sarah",
    curatorAvatar: "https://placehold.co/40x40.png?text=PS",
    curatorAvatarFallback: "PS",
    dataAiHintCuratorAvatar: "policy expert",
  },
  {
    id: "story3",
    title: "Global Water Scarcity: Innovations and Solutions",
    summary: "Investigating the increasing challenges of water scarcity worldwide and highlighting innovative technologies and community-led initiatives aimed at sustainable water management.",
    category: "global",
    lastUpdatedAt: new Date(MOCK_STORY_DATE_MS - 86400000 * 5), // 5 days ago
    // No cover image for this one
    discussionCount: 78,
    curator: "GlobalVoice Leo",
    curatorAvatar: "https://placehold.co/40x40.png?text=GV",
    curatorAvatarFallback: "GV",
    dataAiHintCuratorAvatar: "global activist",
  },
  {
    id: "story4",
    title: "The Future of Urban Transportation in Our City",
    summary: "As our city grows, how will we move? Exploring proposals for public transit expansion, bike lane networks, and new mobility solutions. Share your vision and concerns.",
    category: "local",
    lastUpdatedAt: new Date(MOCK_STORY_DATE_MS - 86400000 * 2), // 2 days ago
    coverImage: "https://placehold.co/600x400.png",
    dataAiHintCover: "city transport bus",
    discussionCount: 28,
    curator: "UrbanSpeaker Maria",
    curatorAvatar: "https://placehold.co/40x40.png?text=US",
    curatorAvatarFallback: "US",
    dataAiHintCuratorAvatar: "urban planner",
  },
];

export let mockArticlesForStory: Record<string, SourceArticle[]> = {
  "story1": [
    { id: "art1-1", title: "City Announces New Recycling Pickup Schedule", url: "#", sourceName: "City Herald", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 0.5), summarySnippet: "The city council has officially released the updated schedule for recycling pickups, effective next month...", dataAiHint: "newspaper article" },
    { id: "art1-2", title: "Understanding Contamination in Recycling Bins", url: "#", sourceName: "EcoWatch Org", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 1), summarySnippet: "A common issue hindering recycling efforts is contamination. Learn what can and cannot be recycled.", dataAiHint: "environment infographic" },
  ],
  "story2": [
    { id: "art2-1", title: "Economists Weigh In on UBI Pilot Programs", url: "#", sourceName: "National Economics Review", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 2), summarySnippet: "Several pilot programs for Universal Basic Income have yielded interesting results, sparking further debate...", dataAiHint: "graph chart" },
  ],
  "story4": [
    { id: "art4-1", title: "Proposed Metro Expansion Routes Revealed", url: "#", sourceName: "Urban Transit Today", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 0.2), summarySnippet: "Details of the proposed metro line expansion, including new station locations and timelines, were shared today.", dataAiHint: "map transport" },
    { id: "art4-2", title: "Community Feedback Session on Bike Lane Project", url: "#", sourceName: "City Planning Dept.", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 1.5), summarySnippet: "The city is seeking public input on the new interconnected bike lane project. Attend the session next Tuesday.", dataAiHint: "people meeting" },
  ]
};
