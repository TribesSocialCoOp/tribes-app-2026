"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Share2, Copy, Check, RefreshCw, Handshake, Radio, Link2, ClipboardPaste, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { createBondInviteLink } from '@/lib/actions/bond-actions';
import { getOrCreatePersonalInviteCode } from '@/lib/actions/profile-actions';
import { isNative } from '@/lib/capacitor/platform';
import { NearbyBondService, type NearbyPeer } from '@/lib/capacitor/nearby-bond';
import { NFCService } from '@/lib/capacitor/nfc-bond';
import { shareContent } from '@/lib/capacitor/share';
import { triggerHaptic, triggerNotificationHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle, NotificationType } from '@capacitor/haptics';
import { generateQRDataUrl } from '@/lib/utils/qr-code';
import { NfcTapAnimation } from './nfc-tap-animation';

// ============================================================
// TYPES
// ============================================================

type Role = 'send' | 'ready';

interface TapToBondScreenProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current user's display name for Nearby advertising */
  displayName?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export function TapToBondScreen({ isOpen, onClose, displayName = 'Tribes User' }: TapToBondScreenProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [role, setRole] = useState<Role>('send');
  const mountedRef = useRef(true);

  // Send state
  const [bondUrl, setBondUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nearbyActive, setNearbyActive] = useState(false);

  // Ready state
  const [discoveredPeers, setDiscoveredPeers] = useState<NearbyPeer[]>([]);
  const [pasteValue, setPasteValue] = useState('');
  const [animationState, setAnimationState] = useState<'sending' | 'waiting' | 'success'>('sending');

  // ============================================================
  // LIFECYCLE
  // ============================================================

  // Track mount status to avoid setState on unmounted component
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Check NFC on mount
  useEffect(() => {
    if (isNative) {
      NFCService.isEnabled().then(setNfcSupported).catch(() => {});
    }
  }, []);

  // Generate bond invite
  const generateInvite = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    setBondUrl(null);
    setQrDataUrl(null);
    setTimeLeft(0);

    try {
      console.log('[TapToBond] Starting invite generation...');
      
      // Run them independently so one failure doesn't block the other
      let bondData: { url: string; expiresAt: Date };
      let inviteCode: string;

      try {
        bondData = await createBondInviteLink();
        console.log('[TapToBond] Bond link created:', bondData.url.substring(0, 50) + '...');
      } catch (e: any) {
        console.error('[TapToBond] createBondInviteLink failed:', e);
        throw new Error(`Bond link failed: ${e.message || 'Unknown error'}`);
      }

      try {
        inviteCode = await getOrCreatePersonalInviteCode();
        console.log('[TapToBond] Invite code obtained');
      } catch (e: any) {
        console.warn('[TapToBond] Invite code failed, proceeding without:', e);
        inviteCode = ''; // Non-critical — continue without invite code
      }

      if (!mountedRef.current) return;

      const separator = bondData.url.includes('?') ? '&' : '?';
      const fullUrl = inviteCode 
        ? `${bondData.url}${separator}invite=${inviteCode}` 
        : bondData.url;
      setBondUrl(fullUrl);

      // Generate QR locally (offline-capable)
      try {
        const qr = await generateQRDataUrl(fullUrl, 280);
        if (mountedRef.current) setQrDataUrl(qr);
        console.log('[TapToBond] QR code generated');
      } catch (qrErr) {
        console.warn('[TapToBond] QR generation failed:', qrErr);
        // Non-critical — user can still copy/share the link
      }

      if (!mountedRef.current) return;

      const seconds = Math.max(0, Math.floor((new Date(bondData.expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(seconds);

      // THE FIX: Stop loading so the QR shows immediately, even if Nearby hangs!
      if (mountedRef.current) setIsLoading(false);

      // Start Nearby advertising if on native
      if (NearbyBondService.isAvailable()) {
        try {
          await NearbyBondService.startSending(displayName, fullUrl, (peer) => {
            setAnimationState('success');
            triggerNotificationHaptic(NotificationType.Success);
            toast({ title: 'Bond sent!', description: `${peer.displayName} received your bond link.` });
          });
          if (mountedRef.current) setNearbyActive(true);
        } catch (nearbyErr) {
          console.warn('[TapToBond] Nearby advertising failed:', nearbyErr);
          // Non-critical — QR still works
        }
      }
    } catch (err: any) {
      console.error('[TapToBond] Generation failed:', err);
      if (mountedRef.current) {
        setError(err.message || 'Failed to generate bond link');
        toast({ title: 'Error', description: err.message || 'Failed to generate bond link', variant: 'destructive' });
      }
    } finally {
      // Moved up
    }
  }, [displayName, toast]);

  // Reset all state when opening/closing
  useEffect(() => {
    if (isOpen) {
      // Reset state for fresh open
      setRole('send');
      setBondUrl(null);
      setQrDataUrl(null);
      setTimeLeft(0);
      setError(null);
      setCopied(false);
      setNearbyActive(false);
      setDiscoveredPeers([]);
      setPasteValue('');
      setAnimationState('sending');
      
      // Generate invite after a tick (ensures clean state)
      const timer = setTimeout(() => {
        generateInvite();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Cleanup on close
      NearbyBondService.stop().catch(() => {});
      setNearbyActive(false);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (!timeLeft || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  // Role switch handler
  const handleRoleSwitch = async (newRole: Role) => {
    await NearbyBondService.stop().catch(() => {});
    setNearbyActive(false);
    setDiscoveredPeers([]);
    setAnimationState(newRole === 'send' ? 'sending' : 'waiting');
    setRole(newRole);

    if (newRole === 'send' && !bondUrl && !isLoading) {
      generateInvite();
    }

    if (newRole === 'ready' && NearbyBondService.isAvailable()) {
      try {
        await NearbyBondService.startReceiving(
          (peer) => {
            setDiscoveredPeers((prev) => {
              if (prev.some(p => p.endpointId === peer.endpointId)) return prev;
              return [...prev, peer];
            });
          },
          (url) => {
            setAnimationState('success');
            triggerNotificationHaptic(NotificationType.Success);
            toast({ title: 'Bond received!', description: 'Opening bond acceptance...' });
            setTimeout(() => {
              try {
                const path = new URL(url).pathname + new URL(url).search;
                router.push(path);
                onClose();
              } catch {
                router.push(url);
                onClose();
              }
            }, 1200);
          },
        );
        setNearbyActive(true);
      } catch (err) {
        console.warn('[TapToBond] Nearby receiving failed:', err);
      }
    }
  };

  // Connect to a discovered peer
  const handleConnectPeer = async (peer: NearbyPeer) => {
    triggerHaptic(ImpactStyle.Medium);
    await NearbyBondService.connectToPeer(peer.endpointId);
    toast({ title: 'Connecting...', description: `Connecting to ${peer.displayName}` });
  };

  // Handle paste link
  const handlePasteLink = () => {
    if (!pasteValue.trim()) return;
    try {
      const url = new URL(pasteValue.trim());
      if (url.pathname.includes('/bond/tap/')) {
        router.push(url.pathname + url.search);
        onClose();
      } else {
        toast({ title: 'Invalid link', description: 'This doesn\'t look like a bond link', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Invalid URL', description: 'Please paste a valid bond link', variant: 'destructive' });
    }
  };

  // Actions
  const handleCopy = () => {
    if (!bondUrl) return;
    triggerHaptic(ImpactStyle.Light);
    navigator.clipboard.writeText(bondUrl);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bond link copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!bondUrl) return;
    triggerHaptic(ImpactStyle.Medium);
    const shared = await shareContent({
      title: 'Bond with me on Tribes',
      text: 'Open this link to create a secure bond on Tribes.',
      url: bondUrl,
    });
    if (!shared) handleCopy();
  };

  const handleNfcTagWrite = async () => {
    if (!bondUrl) return;
    triggerHaptic(ImpactStyle.Medium);
    const success = await NFCService.writeToNfcTag(bondUrl);
    if (success) {
      toast({ title: 'NFC Tag Written', description: 'Others can tap this tag to bond with you.' });
    } else {
      toast({ title: 'Write Failed', description: 'Could not write to NFC tag', variant: 'destructive' });
    }
  };

  const handleClose = () => {
    NearbyBondService.stop().catch(() => {});
    onClose();
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 9999,
        backgroundColor: '#09090b', // solid opaque bg (gray-950)
      }}
    >
      {/* Subtle gradient overlay on top of solid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.08) 0%, transparent 60%)',
        }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Handshake className="h-5 w-5 text-primary" />
          <span className="font-bold text-white text-lg">Bond in Person</span>
        </div>
        <button
          onClick={handleClose}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* Role Toggle */}
      <div className="relative flex mx-4 p-1 bg-white/5 rounded-xl border border-white/10">
        <button
          onClick={() => handleRoleSwitch('send')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            role === 'send'
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Send Bond
        </button>
        <button
          onClick={() => handleRoleSwitch('ready')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            role === 'ready'
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Ready to Bond
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto px-4 py-6">
        {role === 'send' ? (
          /* ======== SEND MODE ======== */
          <div className="flex flex-col items-center gap-6">
            {/* Animation */}
            <NfcTapAnimation state={animationState} />

            {/* Nearby status */}
            {nearbyActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-xs font-semibold text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Broadcasting nearby...
              </div>
            )}

            {/* QR Code / Loading / Error / Expired */}
            {isLoading ? (
              <div className="h-72 w-72 flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Generating secure key...</p>
              </div>
            ) : error ? (
              <div className="h-72 w-72 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-red-500/30 p-6 text-center" style={{ backgroundColor: 'rgba(239,68,68,0.05)' }}>
                <AlertCircle className="h-12 w-12 text-red-400/60" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-red-400">Generation Failed</p>
                  <p className="text-xs text-gray-400 leading-tight">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={generateInvite} className="mt-2 border-white/20 text-white hover:bg-white/10">
                  <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                </Button>
              </div>
            ) : qrDataUrl && timeLeft > 0 ? (
              <div className="p-5 bg-white rounded-2xl shadow-2xl shadow-primary/10">
                <img src={qrDataUrl} alt="Bond QR Code" width={260} height={260} className="rounded-lg" />
              </div>
            ) : bondUrl && timeLeft > 0 ? (
              /* URL generated but QR failed — show link-only fallback */
              <div className="h-72 w-72 flex flex-col items-center justify-center gap-4 rounded-2xl border border-primary/20 p-6 text-center" style={{ backgroundColor: 'rgba(124,58,237,0.05)' }}>
                <Handshake className="h-12 w-12 text-primary/60" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Bond Key Ready</p>
                  <p className="text-xs text-gray-400 leading-tight">Share or copy the link below.</p>
                </div>
              </div>
            ) : (
              <div className="h-72 w-72 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-red-500/20 p-6 text-center" style={{ backgroundColor: 'rgba(239,68,68,0.03)' }}>
                <X className="h-12 w-12 text-red-400/40" />
                <p className="text-sm font-semibold text-red-400">Code Expired</p>
                <Button size="sm" variant="outline" onClick={generateInvite} className="border-white/20 text-white hover:bg-white/10">
                  <RefreshCw className="mr-2 h-4 w-4" /> Generate New
                </Button>
              </div>
            )}

            {/* Timer */}
            {timeLeft > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold font-mono text-gray-300" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                Expires in {formatTime(timeLeft)}
              </div>
            )}

            {/* Actions */}
            {bondUrl && timeLeft > 0 && (
              <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className="h-12 rounded-xl border-white/10 text-white hover:bg-white/10"
                >
                  {copied ? <Check className="mr-2 h-4 w-4 text-green-400" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  onClick={handleShare}
                  className="h-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                >
                  <Share2 className="mr-2 h-4 w-4" /> Share
                </Button>
                {nfcSupported && (
                  <Button
                    variant="outline"
                    onClick={handleNfcTagWrite}
                    className="h-12 rounded-xl border-white/10 text-white hover:bg-white/10 col-span-2"
                  >
                    <Radio className="mr-2 h-4 w-4" /> Write to NFC Tag
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ======== READY MODE ======== */
          <div className="flex flex-col items-center gap-6">
            {/* Animation */}
            <NfcTapAnimation state={animationState} />

            {/* Nearby status */}
            {nearbyActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-xs font-semibold text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Looking for nearby bonds...
              </div>
            )}

            {/* Discovered Peers */}
            {discoveredPeers.length > 0 && (
              <div className="w-full max-w-xs space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nearby</p>
                {discoveredPeers.map((peer) => (
                  <button
                    key={peer.endpointId}
                    onClick={() => handleConnectPeer(peer)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 transition-all group"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-sm">
                      {peer.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-white">{peer.displayName}</p>
                      <p className="text-xs text-gray-400">Wants to bond</p>
                    </div>
                    <Handshake className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            {/* Waiting message */}
            {discoveredPeers.length === 0 && (
              <div className="text-center space-y-2 py-4">
                <p className="text-sm text-gray-400">
                  Ask the other person to open <span className="text-primary font-semibold">&quot;Bond in Person&quot;</span> and select <span className="text-primary font-semibold">&quot;Send Bond&quot;</span>
                </p>
              </div>
            )}

            {/* Fallback options */}
            <div className="w-full max-w-xs space-y-3 pt-4 border-t border-white/10">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Or manually</p>

              {/* Paste link */}
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Paste a bond link..."
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  className="flex-1 h-11 px-3 rounded-xl border border-white/10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                />
                <Button
                  onClick={handlePasteLink}
                  disabled={!pasteValue.trim()}
                  className="h-11 rounded-xl bg-primary hover:bg-primary/90"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center border-t border-white/5">
        <p className="text-xs text-gray-500 flex items-center justify-center gap-1.5">
          <Link2 className="h-3 w-3" />
          Secure Cryptographic Bond Exchange
        </p>
      </div>
    </div>
  );
}
