
"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, Brush } from "lucide-react";

import { CreatePostDialog, type PostFormValues } from '@/components/dialogs/create-post-dialog';
import { SharePostDialog } from '@/components/dialogs/share-post-dialog';
import { AddBlockDialog } from '@/components/dialogs/add-block-dialog'; 
import { CustomizeWallSheet } from '@/components/sheets/customize-wall-sheet';

import type { TribePost } from '@/lib/types';
import MyPostsBlock from '@/components/wall-blocks/my-posts-block';
import HtmlBlock from '@/components/wall-blocks/html-block';
import MusicBlock from '@/components/wall-blocks/music-block';
import VideoBlock from '@/components/wall-blocks/video-block';
import { cn } from '@/lib/utils';


// Define the structure for a block on the wall
export interface WallBlock {
    id: string;
    type: 'my-posts' | 'html' | 'music' | 'video';
    content: any; // This will vary based on the block type
}

export interface WallStyles {
    backgroundColor: string;
    layout: 'single-column' | 'two-column';
}

// Initial state for the wall, now block-based
const initialWallBlocks: WallBlock[] = [
    {
        id: 'block-1',
        type: 'my-posts',
        content: {
            posts: [
                { id: "post1", title: "My Latest Project", content: "Proud to share the launch of my new website! Let me know what you think.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "website project design", sharedWith: {"AI Innovators": "main_profile", "Indie Game Devs": "PixelPioneer"} },
                { id: "post2", title: "Thoughts on AI", content: "A blog post I wrote about the future of artificial intelligence.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "artificial intelligence brain", sharedWith: {"AI Innovators": "WonderlandCoder"} },
                { id: "post3", title: "Hiking Adventure", content: "Some photos from my recent trip to the mountains. This is a private post, only visible to me.", imageUrl: `https://placehold.co/400x225.png`, dataAiHintImage: "mountain landscape hiking", sharedWith: {} },
            ]
        }
    },
    {
        id: 'block-2',
        type: 'html',
        content: {
            html: `<h2>Welcome to My Space!</h2><p>This is a custom HTML block. You can put <strong>any</strong> markup you want here. It's a great way to personalize your page.</p>`
        }
    },
    {
        id: 'block-3',
        type: 'music',
        content: {
            trackUrl: 'https://soundcloud.com/your-track'
        }
    },
];

export default function MyWallPage() {
    const [blocks, setBlocks] = useState<WallBlock[]>(initialWallBlocks);
    const [styles, setStyles] = useState<WallStyles>({
        backgroundColor: 'bg-background',
        layout: 'single-column'
    });

    const [isCreatePostDialogOpen, setIsCreatePostDialogOpen] = useState(false);
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [postToShare, setPostToShare] = useState<(Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) | null>(null);
    const [isAddBlockDialogOpen, setIsAddBlockDialogOpen] = useState(false);
    const [isCustomizeSheetOpen, setIsCustomizeSheetOpen] = useState(false);


    const handlePostCreated = (newPostData: PostFormValues) => {
        const newPost: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> } = {
            id: `wall-post-${Date.now()}`,
            title: newPostData.title,
            content: newPostData.content,
            imageUrl: newPostData.image ? URL.createObjectURL(newPostData.image) : undefined,
            dataAiHintImage: newPostData.image ? 'user upload' : undefined,
            sharedWith: {},
        };

        setBlocks(prevBlocks => prevBlocks.map(block => {
            if (block.type === 'my-posts') {
                return {
                    ...block,
                    content: {
                        ...block.content,
                        posts: [newPost, ...block.content.posts]
                    }
                };
            }
            return block;
        }));
        
        setIsCreatePostDialogOpen(false);
    };

    const handleShareClick = (post: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) => {
        setPostToShare(post);
        setIsShareDialogOpen(true);
    };

    const handleConfirmShare = (postId: string, updatedTribeShares: Record<string, string>) => {
        setBlocks(prevBlocks => prevBlocks.map(block => {
            if (block.type === 'my-posts') {
                return {
                    ...block,
                    content: {
                        ...block.content,
                        posts: block.content.posts.map((p: any) => 
                            p.id === postId ? { ...p, sharedWith: updatedTribeShares } : p
                        )
                    }
                };
            }
            return block;
        }));
        console.log(`Post ${postId} share settings updated to:`, updatedTribeShares);
        setIsShareDialogOpen(false);
    };

    const handleAddBlock = (blockType: 'html' | 'music' | 'video') => {
        let newBlock: WallBlock;
        switch(blockType) {
            case 'html':
                newBlock = { id: `block-${Date.now()}`, type: 'html', content: { html: '<p>New HTML Block - Edit me!</p>' } };
                break;
            case 'music':
                newBlock = { id: `block-${Date.now()}`, type: 'music', content: { trackUrl: '' } };
                break;
            case 'video':
                newBlock = { id: `block-${Date.now()}`, type: 'video', content: { videoUrl: '' } };
                break;
            default:
                return;
        }
        setBlocks(prev => [...prev, newBlock]);
        setIsAddBlockDialogOpen(false);
    };
    
    const handleSaveStyles = (newStyles: WallStyles) => {
        setStyles(newStyles);
        setIsCustomizeSheetOpen(false);
    };

    const renderBlock = (block: WallBlock) => {
        switch (block.type) {
            case 'my-posts':
                return <MyPostsBlock 
                            key={block.id} 
                            posts={block.content.posts} 
                            onShare={handleShareClick} 
                            onCreatePost={() => setIsCreatePostDialogOpen(true)}
                        />;
            case 'html':
                return <HtmlBlock key={block.id} content={block.content} />;
            case 'music':
                return <MusicBlock key={block.id} content={block.content} />;
            case 'video':
                return <VideoBlock key={block.id} content={block.content} />;
            default:
                return null;
        }
    };


  return (
    <div className={cn("p-4 md:p-6 rounded-lg transition-colors", styles.backgroundColor)}>
        <div className="space-y-8 max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">My Wall</h1>
                <p className="text-lg text-muted-foreground mt-1">
                    Your personal space to create and share content with your communities.
                </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsAddBlockDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Add Block</Button>
                    <Button variant="outline" onClick={() => setIsCustomizeSheetOpen(true)}><Brush className="mr-2 h-4 w-4" /> Customize Wall</Button>
                </div>
            </header>
        
            <div className={cn(
                "space-y-8",
                styles.layout === 'two-column' && "md:grid md:grid-cols-2 md:gap-8 md:space-y-0"
            )}>
                {blocks.map(block => renderBlock(block))}
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
        <AddBlockDialog
            isOpen={isAddBlockDialogOpen}
            onOpenChange={setIsAddBlockDialogOpen}
            onAddBlock={handleAddBlock}
        />
        <CustomizeWallSheet
            isOpen={isCustomizeSheetOpen}
            onOpenChange={setIsCustomizeSheetOpen}
            currentStyles={styles}
            onSave={handleSaveStyles}
        />
    </div>
  );
}
