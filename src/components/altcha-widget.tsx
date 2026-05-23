'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'altcha-widget': any;
    }
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'altcha-widget': any;
      }
    }
  }
}

interface AltchaWidgetProps {
  onVerified: (payload: string) => void;
  onError?: () => void;
  onExpired?: () => void;
  className?: string;
}

export interface AltchaWidgetRef {
  reset: () => void;
}

export const AltchaWidget = forwardRef<AltchaWidgetRef, AltchaWidgetProps>(
  function AltchaWidget({ onVerified, onError, onExpired, className }, ref) {
    const [mounted, setMounted] = useState(false);
    const widgetRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetRef.current) {
          widgetRef.current.reset();
        }
      },
    }));

    useEffect(() => {
      setMounted(true);
    }, []);

    // Web Crypto API (crypto.subtle) is disabled in insecure HTTP contexts (e.g. local network IP)
    const isSecure = typeof window !== 'undefined' && window.isSecureContext && !!window.crypto?.subtle;

    useEffect(() => {
      if (mounted && !isSecure) {
        console.log('[altcha] Insecure context (HTTP) or missing Web Crypto API. Bypassing ALTCHA for local development.');
        onVerified('insecure-dev-bypass');
      }
    }, [mounted, isSecure, onVerified]);

    useEffect(() => {
      if (!isSecure || !mounted) return;

      // Register custom element dynamically on client
      import('altcha');

      const el = widgetRef.current;
      if (!el) return;

      const handleVerified = (event: any) => {
        if (event.detail?.payload) {
          onVerified(event.detail.payload);
        }
      };

      const handleStateChange = (event: any) => {
        const state = event.detail?.state;
        if (state === 'error' && onError) {
          onError();
        } else if (state === 'expired' && onExpired) {
          onExpired();
        }
      };

      el.addEventListener('verified', handleVerified);
      el.addEventListener('statechange', handleStateChange);

      return () => {
        el.removeEventListener('verified', handleVerified);
        el.removeEventListener('statechange', handleStateChange);
      };
    }, [mounted, isSecure, onVerified, onError, onExpired]);

    if (!mounted) {
      return (
        <div className={`flex justify-center my-4 ${className || ''}`}>
          <div className="w-full h-[64px] rounded-xl border border-border/40 bg-card/50 animate-pulse" />
        </div>
      );
    }

    if (!isSecure) {
      return (
        <div className={`flex justify-center my-4 ${className || ''}`}>
          <div 
            className="w-full rounded-xl border border-border bg-card text-card-foreground p-4 shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-wide">Verified</span>
                <span className="text-[10px] text-muted-foreground font-medium">Local Dev Bypass</span>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground/60 italic font-mono tracking-wider font-semibold">
              ALTCHA
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex justify-center my-4 ${className || ''}`}>
        <altcha-widget
          ref={widgetRef}
          challenge="/api/altcha/challenge"
          auto="onload"
          hidelogo="true"
          hidelink="true"
          workerize="false"
          class="w-full block"
        />
      </div>
    );
  }
);
