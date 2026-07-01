"use client";

import React from 'react';
import { AgeVerificationDialog } from '@/components/dialogs/age-verification-dialog';

interface OpenOptions {
  /** Run once every requirement is satisfied — e.g. retry the gated action. */
  onResolved?: () => void;
  /** @deprecated alias for {@link OpenOptions.onResolved}. */
  onVerified?: () => void;
}

interface AgeGateContextValue {
  /** Open the 18+ age-gate dialog (opt-in and/or verification). */
  openAgeGate: (opts?: OpenOptions) => void;
}

const AgeGateContext = React.createContext<AgeGateContextValue | null>(null);

/**
 * App-wide host for the 18+ verification flow (issue #32). Mount once near the app
 * root; call useAgeGate().openAgeGate() from any gated action's handler.
 */
export function AgeGateProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const onResolvedRef = React.useRef<(() => void) | undefined>(undefined);

  const openAgeGate = React.useCallback((opts?: OpenOptions) => {
    onResolvedRef.current = opts?.onResolved ?? opts?.onVerified;
    setOpen(true);
  }, []);

  const value = React.useMemo(() => ({ openAgeGate }), [openAgeGate]);

  return (
    <AgeGateContext.Provider value={value}>
      {children}
      <AgeVerificationDialog
        open={open}
        onOpenChange={setOpen}
        onResolved={() => onResolvedRef.current?.()}
      />
    </AgeGateContext.Provider>
  );
}

export function useAgeGate(): AgeGateContextValue {
  const ctx = React.useContext(AgeGateContext);
  if (!ctx) {
    // Safe no-op fallback if used outside the provider (shouldn't happen in-app).
    return { openAgeGate: () => {} };
  }
  return ctx;
}
