"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/icons/app-logo';
import { Loader2, Home, RefreshCw } from 'lucide-react';

/**
 * Custom 404 page with automatic retry for native Capacitor app.
 * 
 * On the native app (iOS/Android), a 404 on initial load is almost always a
 * server cold-start race condition — the WebView fires before the container
 * is fully ready. Instead of showing a dead-end, we auto-retry up to 3 times
 * with a backoff delay. On the web, we show a standard 404 page.
 */

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1500, 3000, 5000]; // Exponential-ish backoff

export default function NotFound() {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('tribes_404_retry_state');
        if (stored) {
          const { count, timestamp } = JSON.parse(stored);
          // If the last retry was less than 2 minutes ago, keep counting
          if (Date.now() - timestamp < 120000) {
            return count;
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    return 0;
  });
  const [showManual, setShowManual] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const isNativeRef = useRef(false);

  // Helper to force a true network reload, bypassing Capacitor WKWebView cache
  const forceReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('_t', Date.now().toString());
    window.location.href = url.toString();
  };

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      setIsOffline(false);
      // Auto-retry when connection comes back
      sessionStorage.setItem('tribes_404_retry_state', JSON.stringify({ count: 0, timestamp: Date.now() }));
      setRetryCount(0);
    };
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Detect native Capacitor environment
    isNativeRef.current = !!(window as any).Capacitor?.isNativePlatform?.();

    // Do not auto-retry if we know we are offline
    if (isOffline) {
      setIsRetrying(false);
      return;
    }

    if (isNativeRef.current && retryCount < MAX_RETRIES) {
      setIsRetrying(true);
      const delay = RETRY_DELAYS[retryCount] ?? 5000;

      const timer = setTimeout(() => {
        const nextCount = retryCount + 1;
        sessionStorage.setItem('tribes_404_retry_state', JSON.stringify({
          count: nextCount,
          timestamp: Date.now()
        }));
        // Use cache-busting instead of window.location.reload()
        forceReload();
      }, delay);

      return () => clearTimeout(timer);
    } else if (isNativeRef.current && retryCount >= MAX_RETRIES) {
      // Exhausted retries — show manual options
      setIsRetrying(false);
      setShowManual(true);
    }
  }, [retryCount, isOffline]);

  // Offline state
  if (isOffline) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center space-y-6">
        <div className="text-primary mb-2">
          <svg className="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">You are offline</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Tribes requires an internet connection to securely load your encrypted communications.
        </p>
        <Button 
          onClick={forceReload} 
          className="mt-4"
        >
          Try Again
        </Button>
      </div>
    );
  }

  // Native auto-retry state: just show a spinner, don't flash the 404
  if (isRetrying) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 space-y-6">
        <AppLogo width={56} height={56} />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Connecting to Tribes...
        </p>
      </div>
    );
  }

  // Full 404 page (web users, or native after retries exhausted)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 space-y-8">
      <AppLogo width={56} height={56} />
      
      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold font-mono text-primary">404</h1>
        <p className="text-lg text-muted-foreground">
          {showManual
            ? "We're having trouble connecting. The server may be restarting."
            : "This page could not be found."
          }
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {showManual && (
          <Button
            variant="default"
            onClick={() => {
              sessionStorage.setItem('tribes_404_retry_state', JSON.stringify({ count: 0, timestamp: Date.now() }));
              setRetryCount(0);
              setIsRetrying(true);
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
        )}
        <Link href="/your-comms">
          <Button variant={showManual ? "outline" : "default"} className="gap-2">
            <Home className="h-4 w-4" /> Go Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
