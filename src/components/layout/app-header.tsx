"use client";

import { useState, useEffect, useRef } from "react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { UserNav } from "@/components/layout/user-nav";
// AppLogo and Link are no longer needed here as the logo is only in the sidebar.
// import { AppLogo } from "@/components/icons/app-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Settings, Search, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivity } from "@/components/providers/activity-provider";
import { useUser } from "@/hooks/use-user";

export function AppHeader() {
  // const { isMobile } = useSidebar(); // No longer needed to conditionally render trigger
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const { unreadCount } = useActivity();
  const { role } = useUser();
  const isGuest = !role;
  const lastScrollTop = useRef(0);
  const THRESHOLD = 10; // Scroll difference threshold to trigger hide/show

  useEffect(() => {
    const main = document.querySelector("main[data-app-ready]");
    if (!main) return;

    const handleScroll = () => {
      const st = main.scrollTop;
      const delta = st - lastScrollTop.current;

      if (st <= 0) {
        setHidden(false); // Always show at the top
      } else if (delta > THRESHOLD) {
        setHidden(true); // Scrolling down → hide header
        lastScrollTop.current = st;
      } else if (delta < -THRESHOLD) {
        setHidden(false); // Scrolling up → show header
        lastScrollTop.current = st;
      }
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={cn(
      "app-header sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0 transition-transform duration-300 ease-in-out will-change-transform",
      hidden && "-translate-y-full md:translate-y-0"
    )}>
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-8"> {/* Changed: Removed 'container', added 'w-full' implicitly by parent or explicitly if needed */}
        <div className="flex items-center">
          {/* Always show SidebarTrigger for a consistent collapse/expand control */}
          <SidebarTrigger className="mr-2" />
          {/* Logo and App Name removed from here. It's in AppSidebar. */}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="flex items-center space-x-1 mr-1">
             {!isGuest && (
               <Link
                 href="/activity"
                 className={cn(
                   "relative p-2 hover:text-foreground rounded-full hover:bg-muted transition-colors",
                   pathname.startsWith('/activity') ? "text-foreground" : "text-muted-foreground"
                 )}
                 aria-label="Activity"
               >
                  <Inbox className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-4 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
               </Link>
             )}
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
