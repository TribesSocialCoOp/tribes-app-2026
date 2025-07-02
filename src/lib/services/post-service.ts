
/**
 * @fileoverview Service layer for post-related actions.
 */
import { initialSampleTribePosts, allMoodStreamPosts, MOCK_CURRENT_USER_ID, moodStreamPostIds } from '@/lib/data';
import type { TribePost, MoodStreamPost } from '@/lib/types';
import type { PostFormValues } from '@/components/dialogs/create-post-dialog';

/**
 * Fetches all posts for a specific tribe.
 * @param tribeId The ID of the tribe.
 * @returns A promise that resolves to an array of posts.
 */
export async function getPostsForTribe(tribeId: string): Promise<TribePost[]> {
  console.log(`Service: Fetching posts for tribe ${tribeId}`);
  return new Promise(resolve => {
    setTimeout(() => {
      const posts = initialSampleTribePosts.filter(p => p.tribeId === tribeId);
      resolve(posts);
    }, 250);
  });
}

/**
 * Fetches all mood stream posts.
 * @returns A promise that resolves to an array of all mood stream posts.
 */
export async function getMoodStreamPosts(): Promise<MoodStreamPost[]> {
  console.log(`Service: Fetching all mood stream posts`);
  return new Promise(resolve => {
    setTimeout(() => {
      resolve([...allMoodStreamPosts]);
    }, 250);
  });
}

/**
 * Simulates creating a new post in a tribe.
 */
export async function createTribePost(tribeId: string, payload: PostFormValues): Promise<TribePost> {
  console.log(`Service: Creating post in tribe ${tribeId}`, payload);

  const newPost: TribePost = {
    id: `new-post-${Date.now()}`,
    tribeId: tribeId,
    authorId: MOCK_CURRENT_USER_ID,
    authorName: "You (Current User)",
    authorAvatarFallback: "ME",
    timestamp: new Date(),
    title: payload.title || undefined,
    content: payload.content,
    // This is a simulation. In a real app, you'd handle file upload separately and get a URL.
    imageUrl: payload.image ? URL.createObjectURL(payload.image) : undefined,
    imageAlt: payload.image ? "User uploaded image" : undefined,
    dataAiHintImage: payload.image ? "user upload" : undefined,
    vibes: 0,
    comments: 0,
    isRemoved: false,
    canBeReposted: true,
  };

  return new Promise(resolve => {
    setTimeout(() => {
      initialSampleTribePosts.unshift(newPost);
      resolve(newPost);
    }, 300);
  });
}

/**
 * Simulates reposting content.
 */
export async function repost(postToRepost: TribePost, editedContent: string): Promise<TribePost> {
  console.log(`Service: Reposting post ${postToRepost.id}`);

  const newPost: TribePost = {
    id: `repost-${postToRepost.id}-${Date.now()}`,
    tribeId: postToRepost.tribeId,
    authorId: postToRepost.authorId,
    authorName: postToRepost.authorName,
    authorAvatar: postToRepost.authorAvatar,
    authorAvatarFallback: postToRepost.authorAvatarFallback,
    dataAiHintAvatar: postToRepost.dataAiHintAvatar,
    timestamp: new Date(),
    title: postToRepost.title ? `Repost: ${postToRepost.title}` : `Repost: Untitled`,
    content: editedContent,
    imageUrl: postToRepost.imageUrl,
    imageAlt: postToRepost.imageAlt,
    dataAiHintImage: postToRepost.dataAiHintImage,
    vibes: 0,
    comments: 0,
    isRemoved: false,
    canBeReposted: true,
    originalPostId: postToRepost.id,
  };

  return new Promise(resolve => {
    setTimeout(() => {
      const originalPostIndex = initialSampleTribePosts.findIndex(p => p.id === postToRepost.id);
      if (originalPostIndex > -1) {
        initialSampleTribePosts[originalPostIndex] = {
          ...initialSampleTribePosts[originalPostIndex],
          canBeReposted: false,
        };
      }
      initialSampleTribePosts.unshift(newPost);
      resolve(newPost);
    }, 300);
  });
}

/**
 * Simulates promoting a post to mood streams.
 */
export async function promotePostToMoods(postId: string, moodSlugs: string[]): Promise<void> {
  console.log(`Service: Promoting post ${postId} to moods: ${moodSlugs.join(', ')}`);
  
  return new Promise(resolve => {
    setTimeout(() => {
      // In a real app, this would create relations in a database.
      // For the prototype, we can add it to the moodStreamPostIds Set if we want it to persist for the session.
      moodStreamPostIds.add(postId);
      console.log(`Post ${postId} is now 'promoted'.`);
      resolve();
    }, 300);
  });
}
