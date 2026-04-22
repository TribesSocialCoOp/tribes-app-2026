
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
  LayoutDashboard, 
  Users,
  Smile,
  Bot,
  Settings,
  HeartHandshake,
  BookOpen,
  PlusCircle,
  Link2,
  CalendarPlus,
  CalendarDays,
  ShieldAlert,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserRole } from "@/lib/types";
import { useUser } from "@/hooks/use-user";

const navItems: { href: string; icon: React.ElementType; label: string; tooltip: string; roles?: UserRole[] }[] = [
  { href: "/your-comms", icon: LayoutDashboard, label: "Intercom", tooltip: "Intercom" },
  { href: "/tribes", icon: Users, label: "Tribes", tooltip: "Tribes" },
  { href: "/bonds", icon: Link2, label: "Bonds", tooltip: "Manage Bonds" },
  { href: "/moods", icon: Smile, label: "Moods", tooltip: "Moods" },
  { href: "/search", icon: Search, label: "Search", tooltip: "Discover" },
  { href: "/events", icon: CalendarDays, label: "Events", tooltip: "Discover Events" },
  { href: "/our-story", icon: BookOpen, label: "Our Story", tooltip: "Our Story" },
  { href: "/ai-assistant", icon: Bot, label: "T-Codex Prime", tooltip: "T-Codex Prime" },
  { href: "/admin/mod-queue", icon: ShieldAlert, label: "Mod Queue", tooltip: "Moderation Queue", roles: ['Admin'] },
];

const bottomNavItems: { href: string; icon: React.ElementType; label: string; tooltip: string; roles?: UserRole[] }[] = [
  { href: "/settings", icon: Settings, label: "Settings", tooltip: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { role: userRole } = useUser();
  const { isMobile, setOpenMobile } = useSidebar();
  
  const isGuest = !userRole;
  const canCreate = !isGuest && userRole !== 'Human_Free';

  const visibleNavItems = navItems.filter(item => !item.roles || (userRole && item.roles.includes(userRole)));
  
  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Notification badge — poll unread count every 30s
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (isGuest) return;
    async function fetchUnread() {
      try {
        const { getUnreadActivityCount } = await import('@/lib/actions/content-actions');
        const count = await getUnreadActivityCount();
        setUnreadCount(count);
      } catch {} // silent fail
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [isGuest]);

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className="flex items-center justify-between p-3 border-b">
        <Link href="/your-comms" className="flex items-center gap-2" onClick={handleLinkClick}>
          <AppLogo width={32} height={32} />
          <span className="font-semibold text-lg font-mono text-sidebar-foreground group-data-[collapsible=icon]:hidden tracking-normal">
            Tribes.app
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
            <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={canCreate ? "/tribes/create" : "/billing"} passHref>
                  <Button
                    onClick={handleLinkClick}
                    variant={canCreate ? "default" : "outline"}
                    className={cn(
                      "w-full justify-start group-data-[collapsible=icon]:justify-center my-1",
                       canCreate && "bg-accent text-accent-foreground hover:bg-[hsl(165,50%,85%)]"
                    )}
                  >
                    {canCreate ? (
                      <PlusCircle className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                    ) : (
                      <HeartHandshake className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                    )}
                    <span className="group-data-[collapsible=icon]:hidden">{canCreate ? 'New Tribe' : 'Upgrade to Create'}</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              {!canCreate && (
                <TooltipContent side="right" align="center">
                  <p>Upgrade to create a new tribe.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={canCreate ? "/events/create" : "/billing"} passHref>
                  <Button
                    onClick={handleLinkClick}
                    variant={canCreate ? "default" : "outline"}
                    className={cn(
                      "w-full justify-start group-data-[collapsible=icon]:justify-center my-1",
                       canCreate && "bg-accent text-accent-foreground hover:bg-[hsl(165,50%,85%)]"
                    )}
                  >
                    {canCreate ? (
                      <CalendarPlus className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                    ) : (
                      <HeartHandshake className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                    )}
                    <span className="group-data-[collapsible=icon]:hidden">{canCreate ? 'New Event' : 'Upgrade to Create'}</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              {!canCreate && (
                <TooltipContent side="right" align="center">
                  <p>Upgrade to create a new event.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
            </>
          )}

          {visibleNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                onClick={handleLinkClick}
                isActive={pathname.startsWith(item.href) && (item.href === "/" ? pathname === "/" : true) } 
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
                  onClick={handleLinkClick}
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
