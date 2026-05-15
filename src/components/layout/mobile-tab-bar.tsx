"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Rss, Tent, SquarePen, Link2, User, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';

export function MobileTabBar() {
  const pathname = usePathname();
  const { role } = useUser();

  let composeHref = '/your-comms?compose=true';
  if (pathname.startsWith('/t/')) {
    const slug = pathname.split('/')[2];
    composeHref = `/t/${slug}?compose=true`;
  } else if (pathname.startsWith('/tribes/') && pathname !== '/tribes') {
    const id = pathname.split('/')[2];
    composeHref = `/tribes/${id}?compose=true`;
  }

  const tabs = [
    { href: '/your-comms', icon: Rss, label: 'Feed' },
    { href: '/tribes', icon: Tent, label: 'Tribes' },
    { href: composeHref, icon: SquarePen, label: 'Post', isCompose: true },
    { href: '/bonds', icon: Link2, label: 'Bonds' },
    { href: '/my-wall', icon: User, label: 'Wall' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-md border-t border-border">
      <div className="flex items-center justify-around h-14 px-1">
        {tabs.map(tab => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== '/' && pathname.startsWith(tab.href));

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors relative min-h-[44px]",
                tab.isCompose ? "mt-[-20px]" : (isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")
              )}
            >
              {tab.isCompose ? (
                 <div className="bg-primary text-primary-foreground h-12 w-12 flex items-center justify-center rounded-full shadow-lg ring-4 ring-background">
                    <tab.icon className="h-6 w-6 ml-0.5" />
                 </div>
              ) : (
                <>
                  <tab.icon className={cn("h-5 w-5", isActive && "stroke-[2.5px]")} />
                  <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
