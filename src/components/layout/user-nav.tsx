
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { CreditCard, LayoutDashboard, LogOut, Settings, User, ShieldAlert } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { logoutAction } from "@/lib/auth-actions";

export function UserNav() {
  const router = useRouter();
  const { user, role, isLoading } = useUser();

  const displayName = user?.name || "Guest";
  const displayEmail = user?.email || "";
  const displayAvatar = user?.avatar || "";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("");

  return (
    <ResponsiveMenu>
      <ResponsiveMenuTrigger asChild>
        <Button variant="ghost" className="relative touch-target-44 rounded-full">
          <UserAvatar 
            user={{ name: displayName, avatar: displayAvatar }} 
            className="h-10 w-10" 
            fallback={initials}
            dataAiHint="profile person"
          />
        </Button>
      </ResponsiveMenuTrigger>
      <ResponsiveMenuContent align="end">
        {/* User info header — visible in both modes */}
        <div className="px-3 py-2">
          <p className="text-sm font-medium leading-none">{displayName}</p>
          <p className="text-xs leading-none text-muted-foreground mt-1">
            {displayEmail || "Not signed in"}
          </p>
        </div>
        <ResponsiveMenuSeparator />
        
        {user ? (
          <>
            <ResponsiveMenuItem onClick={() => router.push('/my-wall')}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>My Wall</span>
            </ResponsiveMenuItem>

            <ResponsiveMenuItem onClick={() => router.push('/billing')}>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Billing</span>
            </ResponsiveMenuItem>
            <ResponsiveMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </ResponsiveMenuItem>
            {(role === 'Admin' || role === 'System') && (
              <ResponsiveMenuItem 
                className="text-amber-600 dark:text-amber-400"
                onClick={() => router.push('/admin/mod-queue')}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                <span>Admin Panel</span>
              </ResponsiveMenuItem>
            )}
            <ResponsiveMenuSeparator />
            <ResponsiveMenuItem 
              onClick={async () => {
                // Drop the in-memory PRF wrapping key so it can't be reused by
                // the next user in this JS session (SPA logout keeps module
                // state alive). Persisted copies stay userId-scoped in IndexedDB.
                try {
                  const { sessionVaultKey } = await import('@/lib/crypto');
                  sessionVaultKey.clearMemory();
                } catch { /* non-critical */ }
                await logoutAction();
                router.push('/login');
                router.refresh();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </ResponsiveMenuItem>
          </>
        ) : (
          <>
            <ResponsiveMenuItem onClick={() => router.push('/login')}>
              <User className="mr-2 h-4 w-4" />
              <span>Log In</span>
            </ResponsiveMenuItem>
            <ResponsiveMenuItem onClick={() => router.push('/signup')}>
              <CreditCard className="mr-2 h-4 w-4 opacity-0" />
              <span>Sign Up</span>
            </ResponsiveMenuItem>
          </>
        )}
      </ResponsiveMenuContent>
    </ResponsiveMenu>
  );
}
