
"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { UserNav } from "@/components/layout/user-nav";
// AppLogo and Link are no longer needed here as the logo is only in the sidebar.
// import { AppLogo } from "@/components/icons/app-logo";
// import Link from "next/link";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const { isMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center">
          {isMobile && <SidebarTrigger className="mr-2" />}
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
