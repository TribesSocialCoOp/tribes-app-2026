import type { UserRole } from '@/lib/types';

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
}

// Changed from const to let to allow mutation for mock data simulation
export let tribesData: Tribe[] = [
  { id: "1", name: "AI Innovators", description: "Exploring the future of artificial intelligence and machine learning. Professional networking and project discussions.", members: 128, isPublic: true, cover: "https://placehold.co/400x200.png?text=AI" , dataAiHint: "technology innovation", moods: ["focus", "learn"], homepageUrl: "https://innovate.ai" },
  { id: "2", name: "Weekend Hikers Club", description: "Sharing trails, tips, and breathtaking views from our adventures in nature.", members: 76, isPublic: true, cover: "https://placehold.co/400x200.png?text=Hiking" , dataAiHint: "nature mountain", moods: ["discover", "connect"] },
  { id: "3", name: "Indie Game Devs", description: "A community for indie game developers to collaborate, share projects, and find local playtesters.", members: 245, isPublic: false, cover: "https://placehold.co/400x200.png?text=Games" , dataAiHint: "gaming development", moods: ["showcase", "game", "learn"], homepageUrl: "https://indiegamedev.guild" },
  { id: "4", name: "Local Bookworms", description: "Discussing our favorite reads and discovering new authors together. Regular meetups.", members: 55, isPublic: true, cover: "https://placehold.co/400x200.png?text=Books" , dataAiHint: "reading library", moods: ["learn", "chill", "connect"] },
  { id: "5", name: "Sustainable Living Hub", description: "Tips and discussions on eco-friendly practices and sustainability projects.", members: 92, isPublic: true, cover: "https://placehold.co/400x200.png?text=Eco" , dataAiHint: "nature environment", moods: ["learn", "discover"] },
  { id: "6", name: "Family Hub", description: "A private space for our family to connect, share updates, and plan events.", members: 15, isPublic: false, cover: "https://placehold.co/400x200.png?text=Family", dataAiHint: "family home", moods: ["connect"] },
  { id: "7", name: "The Local Gig Circuit", description: "Discover and discuss live music, local bands, and upcoming shows in our city. Connect with fellow music lovers.", members: 88, isPublic: true, cover: "https://placehold.co/400x200.png?text=MusicShows", dataAiHint: "live music concert", moods: ["discover", "connect", "showcase"] },
  { id: "8", name: "Artisan Alley Collective", description: "A space for creators, makers, and artists to share their work, find pop-up opportunities, and support each other.", members: 150, isPublic: true, cover: "https://placehold.co/400x200.png?text=Artisans", dataAiHint: "crafts art market", moods: ["showcase", "shop", "connect"] },
  { id: "9", name: "Open Mic Night Crew", description: "For performers (comedy, poetry, music) and fans of open mic nights. Share your material, find venues, and connect.", members: 62, isPublic: true, cover: "https://placehold.co/400x200.png?text=OpenMic", dataAiHint: "performance comedy poetry", moods: ["showcase", "discover", "connect"] },
];

/**
 * A mock of the currently logged-in user's role.
 * Change this to 'Creator', 'Human_Member', or 'Human_Free' to test role-based UI.
 */
export const MOCK_USER_ROLE: UserRole = 'Human_Member';
