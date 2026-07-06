"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NsfwBadge } from '@/components/ui/nsfw-badge';
import { Tent, Users, ArrowRight, Globe, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TribeCardData {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  cover?: string | null;
  isPublic?: boolean;
  isNsfw?: boolean;
  members?: number;
  brandColor?: string | null;
}

interface TribeCardProps {
  tribe: TribeCardData;
  view: 'grid' | 'list';
  className?: string;
}

/**
 * Unified tribe card component used across Circles and Discover.
 * Supports two display modes:
 * - grid: Rich card with cover image, description, member count
 * - list: Compact row with icon, name, and inline metadata
 */
export function TribeCard({ tribe, view, className }: TribeCardProps) {
  const href = tribe.slug ? `/t/${tribe.slug}` : `/tribes/${tribe.id}`;

  if (view === 'list') {
    return (
      <Link href={href} className={cn("block group", className)}>
        <Card className="hover:shadow-md transition-all duration-200 hover:border-primary/30">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              {tribe.cover ? (
                <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 relative">
                  <Image src={tribe.cover} alt={tribe.name} fill className="object-cover" />
                </div>
              ) : (
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={tribe.brandColor ? { background: tribe.brandColor } : undefined}
                >
                  <Tent className={cn("h-5 w-5", tribe.brandColor ? 'text-white' : 'text-primary')} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{tribe.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {tribe.isNsfw && (
                    <NsfwBadge className="text-[10px] px-1.5 py-0" />
                  )}
                  {tribe.isPublic !== undefined && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {tribe.isPublic ? 'Public' : 'Private'}
                    </Badge>
                  )}
                  {tribe.members !== undefined && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                      <Users className="h-3 w-3" /> {tribe.members}
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  // Grid view — rich card
  return (
    <Link href={href} className={cn("block group", className)}>
      <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-primary/30 h-full">
        {tribe.cover ? (
          <div className="relative h-28 w-full overflow-hidden">
            <Image
              src={tribe.cover}
              alt={tribe.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            {tribe.isPublic !== undefined && (
              <div className="absolute bottom-2 left-3">
                <Badge variant="secondary" className="text-[10px] bg-black/50 text-white border-none">
                  {tribe.isPublic ? <><Globe className="h-3 w-3 mr-1" /> Public</> : <><Lock className="h-3 w-3 mr-1" /> Private</>}
                </Badge>
              </div>
            )}
            {tribe.isNsfw && (
              <div className="absolute top-2 right-3">
                <NsfwBadge icon className="text-[10px]" />
              </div>
            )}
          </div>
        ) : (
          <div
            className="relative h-28 w-full overflow-hidden flex items-center justify-center"
            style={tribe.brandColor
              ? { background: `linear-gradient(135deg, ${tribe.brandColor}, ${tribe.brandColor}99)` }
              : undefined
            }
          >
            {!tribe.brandColor && <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />}
            <Tent className={cn("h-12 w-12 relative z-[1]", tribe.brandColor ? 'text-white/60' : 'text-primary/40')} />
            {tribe.isPublic !== undefined && (
              <div className="absolute bottom-2 left-3">
                <Badge variant="secondary" className="text-[10px]">
                  {tribe.isPublic ? 'Public' : 'Private'}
                </Badge>
              </div>
            )}
            {tribe.isNsfw && (
              <div className="absolute top-2 right-3">
                <NsfwBadge icon className="text-[10px]" />
              </div>
            )}
          </div>
        )}
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {tribe.name}
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
          </CardTitle>
          {tribe.description && (
            <CardDescription className="line-clamp-2 text-xs">{tribe.description}</CardDescription>
          )}
        </CardHeader>
        {tribe.members !== undefined && (
          <CardFooter className="pt-0 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 mr-1" /> {tribe.members} members
          </CardFooter>
        )}
      </Card>
    </Link>
  );
}
