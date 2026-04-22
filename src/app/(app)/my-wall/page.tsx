
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, Brush, Loader2 } from "lucide-react";

import { CreatePostDialog, type PostFormValues } from '@/components/dialogs/create-post-dialog';
import { SharePostDialog } from '@/components/dialogs/share-post-dialog';
import { AddBlockDialog } from '@/components/dialogs/add-block-dialog'; 
import { CustomizeWallSheet } from '@/components/sheets/customize-wall-sheet';

import type { TribePost } from '@/lib/types';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { getWallBlocks, saveWallBlock, deleteWallBlock as deleteWallBlockAction, getWallStyle, saveWallStyle } from '@/lib/actions/profile-actions';
import { sharePost } from '@/lib/actions/content-actions';
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

// Default fallback blocks for first-time users
const defaultWallBlocks: WallBlock[] = [
    {
        id: 'block-1',
        type: 'my-posts',
        content: {
            posts: [
                { id: "post1", title: "My Latest Project", content: "Proud to share the launch of my new website! Let me know what you think.", imageUrl: `/seed/post-code.svg`, dataAiHintImage: "website project design", sharedWith: {} },
            ]
        }
    },
];

export default function MyWallPage() {
    const [blocks, setBlocks] = useState<WallBlock[]>([]);
    const [styles, setStyles] = useState<WallStyles>({
        backgroundColor: 'bg-background',
        layout: 'single-column'
    });
    const [isLoadingWall, setIsLoadingWall] = useState(true);

    useEffect(() => {
        const loadWallData = async () => {
            setIsLoadingWall(true);
            try {
                const [dbBlocks, dbStyle] = await Promise.all([
                    getWallBlocks(),
                    getWallStyle(),
                ]);
                if (dbBlocks.length > 0) {
                    setBlocks(dbBlocks.map(b => ({
                        id: b.id,
                        type: b.type as WallBlock['type'],
                        content: JSON.parse(b.content),
                    })));
                } else {
                    setBlocks(defaultWallBlocks);
                }
                setStyles(dbStyle as WallStyles);
            } catch {
                setBlocks(defaultWallBlocks);
            } finally {
                setIsLoadingWall(false);
            }
        };
        loadWallData();
    }, []);

    const [isCreatePostDialogOpen, setIsCreatePostDialogOpen] = useState(false);
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [postToShare, setPostToShare] = useState<(Partial<TribePost> & { id: string, sharedWith?: Record<string, string> }) | null>(null);
    const [isAddBlockDialogOpen, setIsAddBlockDialogOpen] = useState(false);
    const [isCustomizeSheetOpen, setIsCustomizeSheetOpen] = useState(false);


    const { toast } = useToast();

    const handlePostCreated = async (newPostData: PostFormValues) => {
        // Upload image to S3 if present
        let imageUrl: string | undefined;
        if (newPostData.image) {
          try {
            imageUrl = await uploadFile(newPostData.image, 'posts');
          } catch (err: unknown) {
            toast({ variant: 'destructive', title: 'Image Upload Failed', description: ((err instanceof Error) ? err.message : 'An error occurred') });
            // Fall back to local preview
            imageUrl = URL.createObjectURL(newPostData.image);
          }
        }

        const newPost: Partial<TribePost> & { id: string, sharedWith?: Record<string, string> } = {
            id: `wall-post-${Date.now()}`,
            title: newPostData.title,
            content: newPostData.content,
            imageUrl,
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

    const handleConfirmShare = async (postId: string, updatedTribeShares: Record<string, string>) => {
        // Optimistic local state update
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
        setIsShareDialogOpen(false);

        // Persist cross-posts to the database
        try {
            await sharePost({ postId, tribeShares: updatedTribeShares });
            const tribeCount = Object.keys(updatedTribeShares).length;
            toast({
                title: 'Post Shared',
                description: `Your post has been shared to ${tribeCount} tribe${tribeCount !== 1 ? 's' : ''}.`,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to share post';
            toast({ variant: 'destructive', title: 'Share Failed', description: msg });
        }
    };

    const handleAddBlock = async (blockType: 'html' | 'music' | 'video') => {
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
        // Persist to DB
        try {
            await saveWallBlock({ id: newBlock.id, type: newBlock.type, content: JSON.stringify(newBlock.content), sortOrder: blocks.length });
        } catch { /* ignore save errors, block is already in local state */ }
    };
    
    const handleSaveStyles = async (newStyles: WallStyles) => {
        setStyles(newStyles);
        setIsCustomizeSheetOpen(false);
        try {
            await saveWallStyle(newStyles);
        } catch { /* ignore */ }
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
