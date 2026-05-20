
"use client";

import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import { ShieldAlert } from "lucide-react";

export function PlatformFooter() {
  const { role } = useUser();
  const isAdmin = role === 'Admin' || role === 'System';

  return (
    <footer className="w-full pt-10 pb-32 md:pb-10 px-4 md:px-8 border-t bg-muted/20 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-3 text-sm text-muted-foreground">
          <Link href="/terms" className="touch-target-44 hover:text-foreground transition-colors">Terms</Link>
          <Link href="/privacy" className="touch-target-44 hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/community-guidelines" className="touch-target-44 hover:text-foreground transition-colors">Guidelines</Link>
          <Link href="/cookies" className="touch-target-44 hover:text-foreground transition-colors">Cookies</Link>
          <Link href="/report-ncii" className="touch-target-44 font-semibold hover:text-foreground transition-colors">Report NCII</Link>
          
          {isAdmin && (
            <Link 
              href="/admin/mod-queue" 
              className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 font-bold hover:text-amber-400 transition-colors bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 shadow-sm"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Admin / Mod Queue
            </Link>
          )}
        </div>
        
        <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-tighter">
          © {new Date().getFullYear()} Tribes.app • Co-op Human Identity • v1.0
        </div>
      </div>
    </footer>
  );
}
