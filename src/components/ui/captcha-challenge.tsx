'use client';

/**
 * @fileoverview Invisible Proof-of-Work CAPTCHA component.
 * 
 * Automatically solves a PoW challenge in a Web Worker on mount.
 * Calls onVerify(token) when solved (~1-2s on modern hardware).
 * 
 * To swap to Cloudflare Turnstile later:
 * 1. Replace the useEffect with Turnstile script loading
 * 2. Replace the solver with: <div id="cf-turnstile" data-sitekey={SITE_KEY} data-callback={onVerify} />
 * 3. The parent component's interface stays identical
 */

import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';

interface CaptchaChallengeProps {
  /** Called with the solution token when PoW is solved */
  onVerify: (token: string) => void;
  /** Challenge string from server */
  challenge: string;
  /** Difficulty (number of leading zero bits required) */
  difficulty: number;
}

export function CaptchaChallenge({ onVerify, challenge, difficulty }: CaptchaChallengeProps) {
  const [status, setStatus] = useState<'solving' | 'solved' | 'error'>('solving');
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!challenge) return;

    // Create an inline Web Worker to solve PoW off the main thread
    const workerCode = `
      self.onmessage = async function(e) {
        const { challenge, difficulty } = e.data;
        let nonce = 0;
        const maxAttempts = 10_000_000; // Safety cap
        
        while (nonce < maxAttempts) {
          const input = challenge + ':' + nonce.toString(36);
          const buffer = new TextEncoder().encode(input);
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = new Uint8Array(hashBuffer);
          
          // Count leading zero bits
          let zeroBits = 0;
          for (const byte of hashArray) {
            if (byte === 0) {
              zeroBits += 8;
            } else {
              let b = byte;
              while ((b & 0x80) === 0) {
                zeroBits++;
                b <<= 1;
              }
              break;
            }
            if (zeroBits >= difficulty) break;
          }
          
          if (zeroBits >= difficulty) {
            self.postMessage({ solved: true, nonce: nonce.toString(36) });
            return;
          }
          
          nonce++;
          
          // Yield periodically to avoid starving other workers
          if (nonce % 10000 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }
        
        self.postMessage({ solved: false, error: 'Max attempts reached' });
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.solved) {
        const token = `${challenge}:${e.data.nonce}`;
        setStatus('solved');
        onVerify(token);
      } else {
        setStatus('error');
      }
    };

    worker.onerror = () => {
      setStatus('error');
    };

    worker.postMessage({ challenge, difficulty });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [challenge, difficulty, onVerify]);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      {status === 'solving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Verifying you&apos;re human...</span>
        </>
      )}
      {status === 'solved' && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-emerald-600">Verified</span>
        </>
      )}
      {status === 'error' && (
        <>
          <ShieldCheck className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">Verification failed — please refresh</span>
        </>
      )}
    </div>
  );
}

/**
 * Honeypot field — invisible to humans, bots fill it.
 * If this field has a value on submit, reject the form.
 */
export function HoneypotField() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
      <label htmlFor="website_url">Website</label>
      <input
        type="text"
        id="website_url"
        name="website_url"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}
