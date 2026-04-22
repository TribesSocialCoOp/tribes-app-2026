"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { X, Shield, Settings2, Cookie } from 'lucide-react';

// ============================================================
// TYPES & CONSTANTS
// ============================================================

interface ConsentState {
  essential: true; // Always on, not user-toggleable
  analytics: boolean;
  marketing: boolean;
  version: number; // Bump to re-surface banner when categories change
}

const CONSENT_STORAGE_KEY = 'tribes_cookie_consent';
const CONSENT_COOKIE_NAME = 'tribes_consent_v1';
const CONSENT_VERSION = 1;

const DEFAULT_CONSENT: ConsentState = {
  essential: true,
  analytics: false,
  marketing: false,
  version: CONSENT_VERSION,
};

// ============================================================
// PERSISTENCE (localStorage + cookie fallback)
// ============================================================

function loadConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    // Try localStorage first
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed: ConsentState = JSON.parse(raw);
      if (parsed.version >= CONSENT_VERSION) return parsed;
    }
    // Fallback: check cookie (survives localStorage clears)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)tribes_consent_v1=([^;]*)/);
    if (cookieMatch) {
      const parsed: ConsentState = JSON.parse(decodeURIComponent(cookieMatch[1]));
      if (parsed.version >= CONSENT_VERSION) {
        // Re-populate localStorage from cookie
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function saveConsent(consent: ConsentState): void {
  // Persist to localStorage
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  // Also persist to cookie (1 year expiry)
  const encoded = encodeURIComponent(JSON.stringify(consent));
  document.cookie = `${CONSENT_COOKIE_NAME}=${encoded}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
}

// ============================================================
// TOGGLE COMPONENT
// ============================================================

function ConsentToggle({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="pr-4">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${checked ? 'bg-primary' : 'bg-muted'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg
            ring-0 transition-transform duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

// ============================================================
// PREFERENCES MODAL
// ============================================================

function PreferencesModal({
  consent,
  onSave,
  onClose,
}: {
  consent: ConsentState;
  onSave: (consent: ConsentState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ConsentState>(consent);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Cookie Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-1">
          <p className="text-sm text-muted-foreground mb-4">
            We respect your privacy. Choose which categories of cookies you&apos;d like to allow.
            Essential cookies are always active as they&apos;re required for the platform to function.
          </p>

          <div className="divide-y divide-border">
            <ConsentToggle
              id="consent-essential"
              label="Essential"
              description="Required for authentication, security (CSRF protection), and core functionality. Cannot be disabled."
              checked={true}
              onChange={() => {}}
              disabled
            />
            <ConsentToggle
              id="consent-analytics"
              label="Analytics"
              description="Help us understand how the platform is used so we can improve the experience. Data is never sold."
              checked={draft.analytics}
              onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
            />
            <ConsentToggle
              id="consent-marketing"
              label="Marketing"
              description="Used for personalized recommendations and community discovery features."
              checked={draft.marketing}
              onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4 flex items-center justify-between gap-3 rounded-b-xl">
          <button
            onClick={() => {
              onSave({ ...DEFAULT_CONSENT, version: CONSENT_VERSION });
            }}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Reject Optional
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave({ essential: true, analytics: true, marketing: true, version: CONSENT_VERSION });
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-muted hover:bg-accent text-foreground transition-colors"
            >
              Accept All
            </button>
            <button
              onClick={() => onSave(draft)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BANNER
// ============================================================

function ConsentBanner({
  onAcceptAll,
  onManage,
}: {
  onAcceptAll: () => void;
  onManage: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-4xl mx-auto bg-background/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="shrink-0 mt-0.5">
              <Cookie className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">We value your privacy</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We use essential cookies for authentication and security. Optional cookies help us
                improve the platform.{' '}
                <a href="/cookies" className="underline underline-offset-2 hover:text-foreground transition-colors">
                  Cookie Policy
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={onManage}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg border border-border bg-muted hover:bg-accent text-foreground transition-colors flex items-center justify-center gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage
            </button>
            <button
              onClick={onAcceptAll}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN EXPORT
// ============================================================

/**
 * Cookie consent manager with granular controls.
 * 
 * Mount once in the root layout. Shows a banner on first visit,
 * stores preferences in localStorage, and re-surfaces if consent
 * version changes. Exposes a "Cookie Preferences" trigger via
 * the global `window.__openCookiePrefs?.()` for use in footers/legal pages.
 */
export function CookieConsent() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load consent on mount
  useEffect(() => {
    setMounted(true);
    const saved = loadConsent();
    if (saved) {
      setConsent(saved);
      setShowBanner(false);
    } else {
      // Respect Do Not Track as a starting signal
      const dnt = navigator.doNotTrack === '1';
      setConsent(dnt ? DEFAULT_CONSENT : null);
      setShowBanner(true);
    }
  }, []);

  // Expose global function to open preferences from anywhere
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__openCookiePrefs = () => {
        setShowModal(true);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as Record<string, unknown>).__openCookiePrefs;
      }
    };
  }, []);

  const handleSave = useCallback((newConsent: ConsentState) => {
    setConsent(newConsent);
    saveConsent(newConsent);
    setShowBanner(false);
    setShowModal(false);
  }, []);

  const handleAcceptAll = useCallback(() => {
    const all: ConsentState = { essential: true, analytics: true, marketing: true, version: CONSENT_VERSION };
    handleSave(all);
  }, [handleSave]);

  // Don't render during SSR
  if (!mounted) return null;

  return (
    <>
      {showBanner && !showModal && (
        <ConsentBanner
          onAcceptAll={handleAcceptAll}
          onManage={() => setShowModal(true)}
        />
      )}
      {showModal && (
        <PreferencesModal
          consent={consent ?? DEFAULT_CONSENT}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/**
 * Button to open cookie preferences modal.
 * Use in footers or legal pages.
 */
export function CookiePreferencesButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => {
        const fn = (window as unknown as Record<string, unknown>).__openCookiePrefs;
        if (typeof fn === 'function') (fn as () => void)();
      }}
      className={className ?? "text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"}
    >
      Cookie Preferences
    </button>
  );
}
