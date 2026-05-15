
"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { UserNav } from "@/components/layout/user-nav";
// AppLogo and Link are no longer needed here as the logo is only in the sidebar.
// import { AppLogo } from "@/components/icons/app-logo";
import Link from "next/link";
import { Compass, Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppHeader() {
  // const { isMobile } = useSidebar(); // No longer needed to conditionally render trigger

  return (
    <header className="app-header z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-8"> {/* Changed: Removed 'container', added 'w-full' implicitly by parent or explicitly if needed */}
        <div className="flex items-center">
          {/* Always show SidebarTrigger for a consistent collapse/expand control */}
          <SidebarTrigger className="mr-2" />
          {/* Logo and App Name removed from here. It's in AppSidebar. */}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="flex items-center space-x-1 mr-1">
             <Link href="/search" className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
                <Search className="h-5 w-5" />
             </Link>
             <Link href="/discover" className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
                <Compass className="h-5 w-5" />
             </Link>
             <Link href="/settings" className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
                <Settings className="h-5 w-5" />
             </Link>
          </div>
          <div id="header-actions-portal" className="flex items-center space-x-2"></div>
          <UserNav />
        </div>
      </div>
    </header>
  );
}
