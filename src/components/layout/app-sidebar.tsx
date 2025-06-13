
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
  MessageSquare,
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
  ShieldAlert // Added for Mod Queue
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/your-comms", icon: LayoutDashboard, label: "Intercom", tooltip: "Intercom" }, 
  { href: "/chat", icon: MessageSquare, label: "Chats", tooltip: "Chats" },
  { href: "/tribes", icon: Users, label: "Tribes", tooltip: "Tribes" },
  { href: "/bonds", icon: Link2, label: "Bonds", tooltip: "Manage Bonds" },
  { href: "/moods", icon: Smile, label: "Moods", tooltip: "Moods" },
  { href: "/events", icon: CalendarDays, label: "Events", tooltip: "Discover Events" },
  { href: "/files", icon: FileText, label: "Files", tooltip: "Files" },
  { href: "/ai-assistant", icon: Bot, label: "AI Assistant", tooltip: "AI Assistant" },
  { href: "/admin/mod-queue", icon: ShieldAlert, label: "Mod Queue", tooltip: "Moderation Queue" }, // New Item
];

const bottomNavItems = [
    { href: "/settings", icon: Settings, label: "Settings", tooltip: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className="flex items-center justify-between p-3 border-b">
        <Link href="/your-comms" className="flex items-center gap-2">
          <AppLogo className="w-8 h-8 text-sidebar-primary" />
          <span className="font-semibold text-lg font-mono text-sidebar-foreground group-data-[collapsible=icon]:hidden tracking-normal">
            Tribes.app
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1 p-2">
        <SidebarMenu className="space-y-1">
          <Link href="/tribes/create" passHref>
            <Button variant="default" className="w-full justify-start group-data-[collapsible=icon]:justify-center my-1 bg-accent text-accent-foreground hover:bg-accent/90">
                <PlusCircle className="h-5 w-5 mr-2 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">New Tribe</span>
            </Button>
          </Link>
          
          <Link href="/events/create" passHref>
            <Button variant="default" className="w-full justify-start group-data-[collapsible=icon]:justify-center my-1 bg-accent text-accent-foreground hover:bg-accent/90">
                <CalendarPlus className="h-5 w-5 mr-2 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">New Event</span>
            </Button>
          </Link>


          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href) && (item.href === "/" ? pathname === "/" : true) } // More precise active check
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
    
