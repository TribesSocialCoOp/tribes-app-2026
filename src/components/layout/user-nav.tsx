
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <UserAvatar 
            user={{ name: displayName, avatar: displayAvatar }} 
            className="h-10 w-10" 
            fallback={initials}
            dataAiHint="profile person"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {displayEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {user ? (
          <>
            <DropdownMenuGroup>
               <Link href="/my-wall" passHref>
                <DropdownMenuItem>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>My Wall</span>
                  <DropdownMenuShortcut>⇧⌘D</DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
              <Link href="/profile" passHref>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                  <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
              <Link href="/billing" passHref>
                <DropdownMenuItem>
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span>Billing</span>
                  <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
              <Link href="/settings" passHref>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
              </Link>
              {(role === 'Admin' || role === 'System') && (
                <Link href="/admin/mod-queue" passHref>
                  <DropdownMenuItem className="text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400">
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    <span>Admin Panel</span>
                    <DropdownMenuShortcut>⇧⌘A</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </Link>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={async () => {
                await logoutAction();
                router.push('/login');
                router.refresh();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
              <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuGroup>
            <Link href="/login" passHref>
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Log In</span>
              </DropdownMenuItem>
            </Link>
            <Link href="/signup" passHref>
              <DropdownMenuItem>
                <CreditCard className="mr-2 h-4 w-4 opacity-0" />
                <span>Sign Up</span>
              </DropdownMenuItem>
            </Link>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
