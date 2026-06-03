
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar, // Import the hook
} from "@/components/ui/sidebar";
import { AppLogo } from "@/components/icons/app-logo";
import {
  Rss,
  Users,
  Compass,
  User,
  Settings,
  HeartHandshake,
  PlusCircle,
  CalendarPlus,
  ShieldAlert,
  Tent,
  Link2,
  SquarePen,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserRole } from "@/lib/types";
import { useUser } from "@/hooks/use-user";
import { scrollMainToTop } from "@/lib/utils/scroll-utils";

const navItems: { href: string; icon: React.ElementType; label: string; tooltip: string; roles?: UserRole[] }[] = [
  { href: "/your-comms", icon: Rss, label: "Feed", tooltip: "Your Feed" },
  { href: "/tribes", icon: Tent, label: "Tribes", tooltip: "Your Tribes" },
  { href: "/bonds", icon: Link2, label: "Bonds", tooltip: "Your Bonds" },
  { href: "/discover", icon: Compass, label: "Discover", tooltip: "Explore" },
  { href: "/my-wall", icon: User, label: "My Wall", tooltip: "Your Wall & Profile" },
  { href: "/voting", icon: Scale, label: "Governance", tooltip: "Co-Op Governance" },
];

const bottomNavItems: { href: string; icon: React.ElementType; label: string; tooltip: string; roles?: UserRole[] }[] = [
  { href: "/admin/mod-queue", icon: ShieldAlert, label: "Mod Queue", tooltip: "Moderation Queue", roles: ['Admin', 'System'] },
  { href: "/settings", icon: Settings, label: "Settings", tooltip: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { role: userRole } = useUser();
  const { isMobile, setOpenMobile } = useSidebar();

  const isGuest = !userRole;
  const canCreate = !isGuest && userRole !== 'Human_Free';

  const visibleNavItems = navItems.filter(item => !item.roles || (userRole && item.roles.includes(userRole)));

  let composeHref = '/your-comms?compose=true';
  if (pathname.startsWith('/t/')) {
    const slug = pathname.split('/')[2];
    composeHref = `/t/${slug}?compose=true`;
  } else if (pathname.startsWith('/tribes/') && pathname !== '/tribes') {
    const id = pathname.split('/')[2];
    composeHref = `/tribes/${id}?compose=true`;
  }
  const handleLinkClick = (e?: React.MouseEvent, href?: string) => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (e && href) {
      const isActive = pathname.startsWith(href) && (href === '/' ? pathname === '/' : true);
      if (isActive) {
        e.preventDefault();
        scrollMainToTop();
      }
    }
  };

  // Notification badge — event-driven via WS + custom events, no polling
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeProposalCount, setActiveProposalCount] = useState(0);

  // Active proposals badge fetch
  useEffect(() => {
    if (isGuest) return;
    async function fetchActiveProposals() {
      try {
        const { getActiveProposalCount } = await import('@/lib/actions/voting-actions');
        const count = await getActiveProposalCount();
        setActiveProposalCount(count);
      } catch { } // silent fail
    }
    fetchActiveProposals();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchActiveProposals();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isGuest, pathname]);

  // Initial fetch + focus reconciliation (no interval)
  useEffect(() => {
    if (isGuest) return;
    async function fetchUnread() {
      try {
        const { getUnreadActivityCount } = await import('@/lib/actions/content-actions');
        const count = await getUnreadActivityCount();
        setUnreadCount(count);
      } catch { } // silent fail
    }
    fetchUnread();

    // Reconcile on tab regain focus (catches any drift from offline/background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchUnread();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Instant update when user marks activity items as read (same-client event)
    const handleReadChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.unreadCount === 'number') {
        setUnreadCount(detail.unreadCount);
      }
    };
    window.addEventListener('activity-read-change', handleReadChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('activity-read-change', handleReadChange);
    };
  }, [isGuest, pathname]);

  // Live WS unread bump — increment badge instantly on incoming activity
  useEffect(() => {
    if (isGuest || typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_WS_RELAY_URL) return;

    const { TribesWebSocket } = require('@/lib/ws-client');
    const ws = TribesWebSocket.getInstance();

    const unsub = ws.subscribe('message', () => {
      setUnreadCount(prev => prev + 1);
    });

    return unsub;
  }, [isGuest]);

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className="flex items-center justify-between p-3 border-b">
        <Link href="/your-comms" className="flex items-center gap-2" onClick={(e) => handleLinkClick(e, '/your-comms')}>
          <AppLogo width={32} height={32} />
          <span className="font-semibold text-lg font-mono text-sidebar-foreground group-data-[collapsible=icon]:hidden tracking-normal">
            Tribes
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1 p-2">
        <SidebarMenu className="space-y-1">
          {isGuest ? (
            <>
              <Link href="/login" passHref>
                <Button
                  onClick={handleLinkClick}
                  variant="outline"
                  className="w-full justify-start group-data-[collapsible=icon]:justify-center my-1 border-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <HeartHandshake className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Log In</span>
                </Button>
              </Link>
              <Link href="/signup" passHref>
                <Button
                  onClick={handleLinkClick}
                  className="w-full justify-start group-data-[collapsible=icon]:justify-center my-1 bg-accent text-accent-foreground hover:bg-[hsl(165,50%,85%)]"
                >
                  <PlusCircle className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Sign Up</span>
                </Button>
              </Link>
            </>
          ) : (
            <div className="px-2 mb-2 space-y-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={composeHref} passHref>
                      <Button
                        onClick={handleLinkClick}
                        className="w-full justify-start group-data-[collapsible=icon]:justify-center bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <SquarePen className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                        <span className="group-data-[collapsible=icon]:hidden font-medium">New Post</span>
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center">
                    <p>Create a new post</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {canCreate ? (
                <div className="flex gap-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href="/tribes/create" passHref className="flex-1 group-data-[collapsible=icon]:w-full">
                          <Button
                            onClick={handleLinkClick}
                            variant="outline"
                            size="sm"
                            className="w-full h-8 px-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
                          >
                            <Tent className="mr-1.5 h-3.5 w-3.5 group-data-[collapsible=icon]:mr-0" />
                            <span className="group-data-[collapsible=icon]:hidden text-xs font-medium">Tribe</span>
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center">
                        <p>Create a new tribe</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href="/events/create" passHref className="flex-1 group-data-[collapsible=icon]:w-full">
                          <Button
                            onClick={handleLinkClick}
                            variant="outline"
                            size="sm"
                            className="w-full h-8 px-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
                          >
                            <CalendarPlus className="mr-1.5 h-3.5 w-3.5 group-data-[collapsible=icon]:mr-0" />
                            <span className="group-data-[collapsible=icon]:hidden text-xs font-medium">Event</span>
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center">
                        <p>Create a new event</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/billing" passHref>
                        <Button
                          onClick={handleLinkClick}
                          variant="outline"
                          size="sm"
                          className="w-full h-8 px-2 justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                        >
                          <HeartHandshake className="mr-1.5 h-3.5 w-3.5 group-data-[collapsible=icon]:mr-0" />
                          <span className="group-data-[collapsible=icon]:hidden text-xs font-medium">Upgrade to Create</span>
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                      <p>Upgrade to create tribes and events.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}

          {visibleNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                onClick={(e) => handleLinkClick(e, item.href)}
                isActive={pathname.startsWith(item.href) && (item.href === "/" ? pathname === "/" : true)}
                tooltip={item.tooltip}
                className={cn(
                  "justify-start",
                  "group-data-[collapsible=icon]:justify-center"
                )}
              >
                <Link href={item.href}>
                  <item.icon className="h-5 w-5 mr-2 group-data-[collapsible=icon]:mr-0" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  {item.href === '/your-comms' && unreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:h-3 group-data-[collapsible=icon]:min-w-[12px] group-data-[collapsible=icon]:text-[10px]">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  {item.href === '/voting' && activeProposalCount > 0 && (
                    <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1 animate-pulse group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:h-2 group-data-[collapsible=icon]:w-2 group-data-[collapsible=icon]:min-w-[8px] group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:text-[0px]">
                      {activeProposalCount}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t">
        <SidebarMenu>
          {bottomNavItems
            .filter(item => !item.roles || (userRole && item.roles.includes(userRole)))
            .map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  onClick={(e) => handleLinkClick(e, item.href)}
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.tooltip}
                  className={cn(
                    "justify-start",
                    "group-data-[collapsible=icon]:justify-center"
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="h-5 w-5 mr-2 group-data-[collapsible=icon]:mr-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
