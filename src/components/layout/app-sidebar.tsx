
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { AppLogo } from "@/components/icons/app-logo";
import {
  LayoutDashboard, 
  Users,
  Smile,
  Bot,
  Settings,
  Sparkles,
  FileText,
  PlusCircle,
  Link2,
  CalendarPlus,
  CalendarDays,
  ShieldAlert,
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserRole } from "@/lib/types";
import { MOCK_USER_ROLE } from "@/lib/data";

const navItems: { href: string; icon: React.ElementType; label: string; tooltip: string; roles?: UserRole[] }[] = [
  { href: "/your-comms", icon: LayoutDashboard, label: "Intercom", tooltip: "Intercom" },
  { href: "/tribes", icon: Users, label: "Tribes", tooltip: "Tribes" },
  { href: "/bonds", icon: Link2, label: "Bonds", tooltip: "Manage Bonds" },
  { href: "/moods", icon: Smile, label: "Moods", tooltip: "Moods" },
  { href: "/events", icon: CalendarDays, label: "Events", tooltip: "Discover Events" },
  { href: "/our-story", icon: BookOpen, label: "Our Story", tooltip: "Our Story" },
  { href: "/files", icon: FileText, label: "Files", tooltip: "Files" },
  { href: "/ai-assistant", icon: Bot, label: "T-Codex Prime", tooltip: "T-Codex Prime" },
  { href: "/admin/mod-queue", icon: ShieldAlert, label: "Mod Queue", tooltip: "Moderation Queue", roles: ['Admin'] },
];

const bottomNavItems = [
    { href: "/settings", icon: Settings, label: "Settings", tooltip: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  // The `canCreate` logic now checks for any paid or admin tier.
  const canCreate = MOCK_USER_ROLE === 'Human_Member' || MOCK_USER_ROLE === 'Creator' || MOCK_USER_ROLE === 'Admin';

  const visibleNavItems = navItems.filter(item => !item.roles || item.roles.includes(MOCK_USER_ROLE));

  const CreateButtonWrapper: React.FC<{ href: string; canDoAction: boolean; tooltipText: string; children: React.ReactNode }> = ({ href, canDoAction, tooltipText, children }) => {
    const trigger = (
      <div className={cn(!canDoAction && "cursor-not-allowed w-full")}>
        <Link href={canDoAction ? href : "#"} passHref legacyBehavior>
          {children}
        </Link>
      </div>
    );

    if (!canDoAction) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" align="center">
              <p>{tooltipText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return trigger;
  };


  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className="flex items-center justify-between p-3 border-b">
        <Link href="/your-comms" className="flex items-center gap-2">
          <AppLogo width={32} height={32} />
          <span className="font-semibold text-lg font-mono text-sidebar-foreground group-data-[collapsible=icon]:hidden tracking-normal">
            Tribes.app
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1 p-2">
        <SidebarMenu className="space-y-1">
          <CreateButtonWrapper 
            href="/tribes/create" 
            canDoAction={canCreate} 
            tooltipText="Upgrade to an Individual Membership to create tribes."
          >
             <Button 
                as="a"
                variant="default" 
                className="w-full justify-start group-data-[collapsible=icon]:justify-center my-1 bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!canCreate}
              >
                <PlusCircle className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">New Tribe</span>
            </Button>
          </CreateButtonWrapper>
          
           <CreateButtonWrapper 
            href="/events/create" 
            canDoAction={canCreate} 
            tooltipText="Upgrade to an Individual Membership to create events."
          >
            <Button 
              as="a"
              variant="default" 
              className="w-full justify-start group-data-[collapsible=icon]:justify-center my-1 bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!canCreate}
            >
                <CalendarPlus className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">New Event</span>
            </Button>
          </CreateButtonWrapper>


          {visibleNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href) && (item.href === "/" ? pathname === "/" : true) } 
                  tooltip={item.tooltip}
                  className={cn(
                    "justify-start",
                    "group-data-[collapsible=icon]:justify-center"
                  )}
                >
                  <item.icon className="h-5 w-5 mr-2 group-data-[collapsible=icon]:mr-0" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t">
         <SidebarMenu>
            {bottomNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                <Link href={item.href} passHref legacyBehavior>
                    <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.tooltip}
                    className={cn(
                        "justify-start",
                        "group-data-[collapsible=icon]:justify-center"
                    )}
                    >
                    <item.icon className="h-5 w-5 mr-2 group-data-[collapsible=icon]:mr-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                </Link>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
    
