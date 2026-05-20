
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShieldAlert, Users, Inbox, Ticket } from "lucide-react";
import { AuthGuard } from "@/components/providers/auth-guard";

const adminNavItems = [
  { href: "/admin/mod-queue", icon: ShieldAlert, label: "Mod Queue" },
  { href: "/admin/ncii-reports", icon: ShieldAlert, label: "NCII Reports" },
  { href: "/admin/users", icon: Users, label: "User Management" },
  { href: "/admin/invite-codes", icon: Ticket, label: "Invite Codes" },
  { href: "/admin/mailbox", icon: Inbox, label: "Admin Mailbox" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard requiredRole="Admin" message="This section is restricted to platform administrators.">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Control Center</h1>
            <p className="text-muted-foreground">Manage platform content, users, and communications.</p>
          </div>
          
          <nav className="flex items-center space-x-1 bg-muted p-1 rounded-lg">
            {adminNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    isActive 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="animate-in fade-in duration-500">
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
