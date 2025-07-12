
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Share2, Users } from "lucide-react";
import Image from "next/image";
import { CreatePostDialog, type PostFormValues } from '@/components/dialogs/create-post-dialog';
import { SharePostDialog } from '@/components/dialogs/share-post-dialog';
import type { TribePost } from '@/lib/types';
import { Badge } from '@/components/ui/badge';


// Placeholder for a Wall Item Card
const WallItemCard = ({ post, onShare }: { post: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }, onShare: (post: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) => void }) => {
  const sharedTribes = post.sharedWith ? Object.keys(post.sharedWith) : [];

  return (
    <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow flex flex-col">
      <CardHeader>
        <CardTitle className="tracking-normal text-xl">{post.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        {post.imageUrl &&
          <div className="relative aspect-video w-full overflow-hidden rounded-md border mb-4">
            <Image 
              src={post.imageUrl}
              alt={post.title || "Wall post image"}
              fill
              style={{ objectFit: 'cover' }}
              data-ai-hint={post.dataAiHintImage || "user content"}
            />
          </div>
        }
        <CardDescription>{post.content}</CardDescription>
      </CardContent>
      <CardFooter className="flex-col items-start gap-3">
        {sharedTribes.length > 0 && (
          <div className="w-full">
            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center">
              <Users className="h-3 w-3 mr-1.5" />
              Shared with:
            </h4>
            <ul className="list-disc list-inside text-sm text-foreground">
              {sharedTribes.map(tribeName => <li key={tribeName}>{tribeName}</li>)}
            </ul>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => onShare(post)}>
            <Share2 className="mr-2 h-4 w-4" /> Share
        </Button>
      </CardFooter>
    </Card>
  );
};


export default function MyWallPage() {
    const [isCreatePostDialogOpen, setIsCreatePostDialogOpen] = useState(false);
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [postToShare, setPostToShare] = useState<(Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) | null>(null);

    const [wallPosts, setWallPosts] = useState<(Partial<TribePost> & { id: string, sharedWith?: Record<string, string> })[]>([
        { id: "post1", title: "My Latest Project", content: "Proud to share the launch of my new website! Let me know what you think.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "website project design", sharedWith: {"AI Innovators": "main_profile", "Indie Game Devs": "PixelPioneer"} },
        { id: "post2", title: "Thoughts on AI", content: "A blog post I wrote about the future of artificial intelligence.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "artificial intelligence brain", sharedWith: {"AI Innovators": "WonderlandCoder"} },
        { id: "post3", title: "Hiking Adventure", content: "Some photos from my recent trip to the mountains. This is a private post, only visible to me.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "mountain landscape hiking", sharedWith: {} },
    ]);


    const handlePostCreated = (newPostData: PostFormValues) => {
        const newPost: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> } = {
            id: `wall-post-${Date.now()}`,
            title: newPostData.title,
            content: newPostData.content,
            imageUrl: newPostData.image ? URL.createObjectURL(newPostData.image) : undefined,
            dataAiHintImage: newPostData.image ? 'user upload' : undefined,
            sharedWith: {}, // New posts are private by default
        };

        setWallPosts(prev => [newPost, ...prev]);
        
        console.log(`Post created privately on wall.`);
        
        setIsCreatePostDialogOpen(false);
    };

    const handleShareClick = (post: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) => {
        setPostToShare(post);
        setIsShareDialogOpen(true);
    };

    const handleConfirmShare = (postId: string, updatedTribeShares: Record<string, string>) => {
        setWallPosts(prevPosts => 
            prevPosts.map(p => 
                p.id === postId ? { ...p, sharedWith: updatedTribeShares } : p
            )
        );
        console.log(`Post ${postId} share settings updated to:`, updatedTribeShares);
        setIsShareDialogOpen(false);
    };


  return (
    <>
        <div className="space-y-8">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">My Wall</h1>
                <p className="text-lg text-muted-foreground mt-1">
                    Your personal space to create and share content with your communities.
                </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsCreatePostDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Add to Wall</Button>
                </div>
            </header>
        
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {wallPosts.length > 0 ? (
                    wallPosts.map((post) => (
                        <WallItemCard key={post.id} post={post} onShare={handleShareClick} />
                    ))
                 ) : (
                    <div className="col-span-full text-center py-12">
                        <Card className="inline-block p-8 shadow-md">
                            <CardContent className="flex flex-col items-center justify-center">
                                <p className="text-muted-foreground">Your wall is empty.</p>
                                <Button variant="link" className="mt-2" onClick={() => setIsCreatePostDialogOpen(true)}>Create your first post</Button>
                            </CardContent>
                        </Card>
                    </div>
                 )}
            </div>
        </div>
        <CreatePostDialog
            isOpen={isCreatePostDialogOpen}
            onOpenChange={setIsCreatePostDialogOpen}
            onPostCreated={handlePostCreated}
        />
        <SharePostDialog
            isOpen={isShareDialogOpen}
            onOpenChange={setIsShareDialogOpen}
            post={postToShare}
            onConfirmShare={handleConfirmShare}
        />
    </>
  );
}
