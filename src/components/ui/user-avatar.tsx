import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarSvg } from "@/lib/placeholder-svg";

export interface UserAvatarProps {
  user: {
    name?: string | null;
    avatar?: string | null;
  };
  className?: string;
  fallback?: string;
  dataAiHint?: string;
}

export function UserAvatar({ user, className, fallback, dataAiHint }: UserAvatarProps) {
  const displayName = user?.name || "Unknown";
  
  return (
    <Avatar className={cn("overflow-hidden", className)}>
      <AvatarImage 
        src={user?.avatar || avatarSvg(displayName)} 
        alt={displayName} 
        data-ai-hint={dataAiHint || "avatar"} 
      />
      <AvatarFallback className="text-xs font-medium bg-muted pb-[2px]">
        {fallback || displayName.substring(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
