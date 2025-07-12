
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Globe, Lock, PlusCircle, Settings, Share2 } from "lucide-react";
import Image from "next/image";
import { CreatePostDialog, type PostFormValues } from '@/components/dialogs/create-post-dialog';
import type { TribePost } from '@/lib/types';


// Placeholder for a Wall Item Card
const WallItemCard = ({ post }: { post: Partial<TribePost> }) => (
  <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
    <CardHeader>
      <CardTitle className="tracking-normal">{post.title}</CardTitle>
    </CardHeader>
    <CardContent>
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
    <CardFooter>
        <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" /> Share to Tribe
        </Button>
    </CardFooter>
  </Card>
);

export default function MyWallPage() {
    const [isCreatePostDialogOpen, setIsCreatePostDialogOpen] = useState(false);
    const [publicPosts, setPublicPosts] = useState<Partial<TribePost>[]>([
        { title: "My Latest Project", content: "Proud to share the launch of my new website! Let me know what you think.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "website project design" },
        { title: "Thoughts on AI", content: "A blog post I wrote about the future of artificial intelligence.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "artificial intelligence brain" },
        { title: "Hiking Adventure", content: "Some photos from my recent trip to the mountains.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "mountain landscape hiking" },
    ]);
    const [privatePosts, setPrivatePosts] = useState<Partial<TribePost>[]>([]);

    const [activeTab, setActiveTab] = useState("public");

    const handlePostCreated = (newPostData: PostFormValues) => {
        const newPost: Partial<TribePost> = {
            title: newPostData.title,
            content: newPostData.content,
            imageUrl: newPostData.image ? URL.createObjectURL(newPostData.image) : undefined,
            dataAiHintImage: newPostData.image ? 'user upload' : undefined
        };

        if (activeTab === 'public') {
            setPublicPosts(prev => [newPost, ...prev]);
        } else {
            setPrivatePosts(prev => [newPost, ...prev]);
        }
        setIsCreatePostDialogOpen(false);
    };


  return (
    <>
        <div className="space-y-8">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
            <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">My Wall</h1>
            <p className="text-lg text-muted-foreground mt-1">
                Your personal space. Curate what you share with different communities.
            </p>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setIsCreatePostDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Add to Wall</Button>
                <Button variant="outline"><Settings className="mr-2 h-4 w-4" /> Manage Walls</Button>
            </div>
        </header>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="public" className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> Public
            </TabsTrigger>
            <TabsTrigger value="private" className="flex items-center gap-2">
                <Lock className="h-4 w-4" /> Private
            </TabsTrigger>
            </TabsList>

            <TabsContent value="public" className="mt-6">
            <Card>
                <CardHeader>
                <CardTitle>Public Wall</CardTitle>
                <CardDescription>This is what everyone sees. Grant access to tribes to let them view more.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {publicPosts.map((post, index) => (
                        <WallItemCard key={`public-${index}`} post={post} />
                    ))}
                </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="private" className="mt-6">
            <Card>
                <CardHeader>
                <CardTitle>Private Wall</CardTitle>
                <CardDescription>Only you can see this wall. Use it for notes, drafts, or personal reminders.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {privatePosts.length > 0 ? (
                        privatePosts.map((post, index) => <WallItemCard key={`private-${index}`} post={post} />)
                     ) : (
                        <div className="col-span-full text-center py-12">
                            <p className="text-muted-foreground">Your private wall is empty.</p>
                            <Button variant="link" className="mt-2" onClick={() => setIsCreatePostDialogOpen(true)}>Add a private note</Button>
                        </div>
                     )}
                </CardContent>
            </Card>
            </TabsContent>
        </Tabs>
        </div>
        <CreatePostDialog
            isOpen={isCreatePostDialogOpen}
            onOpenChange={setIsCreatePostDialogOpen}
            onPostCreated={handlePostCreated}
            tribeName="your Wall" // Generic wording since it's not tribe-specific
        />
    </>
  );
}
