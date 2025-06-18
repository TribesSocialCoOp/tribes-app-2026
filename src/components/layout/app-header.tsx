
"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { UserNav } from "@/components/layout/user-nav";
// AppLogo and Link are no longer needed here as the logo is only in the sidebar.
// import { AppLogo } from "@/components/icons/app-logo";
// import Link from "next/link";
import { cn } from "@/lib/utils";

export function AppHeader() {
  // const { isMobile } = useSidebar(); // No longer needed to conditionally render trigger

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-8"> {/* Changed: Removed 'container', added 'w-full' implicitly by parent or explicitly if needed */}
        <div className="flex items-center">
          {/* Always show SidebarTrigger for a consistent collapse/expand control */}
          <SidebarTrigger className="mr-2" />
          {/* Logo and App Name removed from here. It's in AppSidebar. */}
        </div>

        <div className="flex items-center space-x-4">
          {/* Add any header actions here if needed */}
          <UserNav />
        </div>
      </div>
    </header>
  );
}
