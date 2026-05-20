import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tribes.app — Legal',
  description: 'Legal policies and terms for Tribes.app.',
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <Link href="/dashboard" className="text-xl font-bold font-mono tracking-tight text-foreground hover:text-primary transition-colors">
              Tribes.app
            </Link>
            <Link 
              href="/dashboard" 
              className="sm:hidden inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-all duration-200 shadow-sm"
            >
              ← Back to App
            </Link>
          </div>
          
          <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/community-guidelines" className="hover:text-foreground transition-colors">Guidelines</Link>
              <Link href="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
              <Link href="/report-ncii" className="font-semibold hover:text-foreground transition-colors">Report NCII</Link>
            </nav>
            
            <Link 
              href="/dashboard" 
              className="hidden sm:inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-all duration-200 shadow-sm whitespace-nowrap"
            >
              ← Back to App
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Tribes.app — All rights reserved.</p>
          <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/community-guidelines" className="hover:text-foreground transition-colors">Community Guidelines</Link>
            <Link href="/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link>
            <Link href="/report-ncii" className="font-semibold hover:text-foreground transition-colors">Report NCII</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
