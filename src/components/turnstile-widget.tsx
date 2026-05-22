/**
 * @fileoverview Cloudflare Turnstile widget using official @marsidev/react-turnstile.
 * Supports imperative reset via ref for retrying after failed submissions.
 *
 * @deprecated — ALTCHA is now the primary challenge. This component will be removed in a future release.
 */

'use client';

import React, { Component, forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

interface TurnstileWidgetProps {
  onVerified: (token: string) => void;
  onError?: () => void;
  onExpired?: () => void;
  className?: string;
}

export interface TurnstileWidgetRef {
  reset: () => void;
}

class TurnstileErrorBoundary extends Component<{ children: ReactNode; onError?: () => void }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[turnstile] Script loading error caught by boundary:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-sm text-amber-500 text-center py-2">
          Turnstile challenge failed to load (possibly blocked by browser shields).
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * @deprecated — ALTCHA is now the primary challenge. Use AltchaWidget instead.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerified, onError, onExpired, className }, ref) {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const instanceRef = useRef<TurnstileInstance | null>(null);

    useImperativeHandle(ref, () => ({
      reset: () => instanceRef.current?.reset(),
    }));

    if (!siteKey) return null;

    return (
      <TurnstileErrorBoundary onError={onError}>
        <Turnstile
          ref={instanceRef}
          siteKey={siteKey}
          onSuccess={onVerified}
          onError={onError}
          onExpire={onExpired}
          options={{ theme: 'auto', size: 'flexible' }}
          className={className}
        />
      </TurnstileErrorBoundary>
    );
  }
);
