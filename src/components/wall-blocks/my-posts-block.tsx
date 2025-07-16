
"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, Users, FileText, PlusCircle } from "lucide-react";
import Image from "next/image";
import type { TribePost } from '@/lib/types';

interface MyPostsBlockProps {
  posts: (Partial<TribePost> & { id: string, sharedWith?: Record<string, string> })[];
  onShare: (post: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) => void;
  onCreatePost: () => void;
}

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

export default function MyPostsBlock({ posts, onShare, onCreatePost }: MyPostsBlockProps) {
  return (
    <Card className="bg-muted/30">
        <CardHeader>
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle className="flex items-center text-2xl">
                        <FileText className="mr-3 h-6 w-6 text-primary"/>
                        My Posts
                    </CardTitle>
                    <CardDescription className="mt-1">Content you've created. Share it with your tribes.</CardDescription>
                </div>
                <Button variant="outline" onClick={onCreatePost}>
                    <PlusCircle className="mr-2 h-4 w-4"/>
                    Create Post
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.length > 0 ? (
                    posts.map((post) => (
                        <WallItemCard key={post.id} post={post} onShare={onShare} />
                    ))
                 ) : (
                    <div className="col-span-full text-center py-12">
                        <Card className="inline-block p-8 shadow-md">
                            <CardContent className="flex flex-col items-center justify-center">
                                <p className="text-muted-foreground">You haven't created any posts yet.</p>
                                <Button variant="link" className="mt-2" onClick={onCreatePost}>Create your first post</Button>
                            </CardContent>
                        </Card>
                    </div>
                 )}
            </div>
        </CardContent>
    </Card>
  );
}
