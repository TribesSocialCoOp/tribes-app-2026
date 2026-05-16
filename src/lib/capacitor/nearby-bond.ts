/**
 * @fileoverview Nearby Bond Service — NameDrop-style proximity bonding.
 *
 * Uses Multipeer Connectivity (iOS) / Google Nearby Connections (Android)
 * via @squareetlabs/capacitor-nearby-multipeer to enable phone-to-phone
 * bond token exchange without NFC.
 *
 * Flow:
 * 1. Sender advertises with their display name + bond URL
 * 2. Receiver discovers nearby senders
 * 3. Mutual connection → bond URL exchanged via P2P message
 * 4. Receiver navigates to /bond/tap/[token] for acceptance
 */

import { isNative, platform } from './platform';
import { triggerHaptic, triggerNotificationHaptic } from './haptics';
import { ImpactStyle, NotificationType } from '@capacitor/haptics';

// Lazy-import to avoid loading the plugin on web
let NearbyMultipeer: any = null;

async function getPlugin() {
  if (!NearbyMultipeer) {
    const mod = await import('@squareetlabs/capacitor-nearby-multipeer');
    NearbyMultipeer = mod.NearbyMultipeer;
  }
  return NearbyMultipeer;
}

// ============================================================
// TYPES
// ============================================================

export interface NearbyPeer {
  endpointId: string;
  displayName: string;
}

type PeerFoundCallback = (peer: NearbyPeer) => void;
type BondReceivedCallback = (bondUrl: string) => void;

// ============================================================
// STATE
// ============================================================

let isInitialized = false;
let activeListeners: Array<{ remove: () => void }> = [];
let currentBondUrl: string | null = null;

// ============================================================
// SERVICE
// ============================================================

export const NearbyBondService = {
  /**
   * Check if nearby discovery is available.
   * The underlying plugin uses Apple MultipeerConnectivity — iOS only.
   * Android users bond via QR code instead.
   */
  isAvailable(): boolean {
    return isNative && platform === 'ios';
  },

  /**
   * Initialize the Nearby Multipeer plugin.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    if (!isNative || isInitialized) return;

    try {
      const plugin = await getPlugin();
      await plugin.initialize({
        serviceId: 'app.tribes.bond',
      });
      isInitialized = true;
      console.log('[nearby-bond] Initialized');
    } catch (err) {
      console.warn('[nearby-bond] Init failed:', err);
    }
  },

  /**
   * Start advertising: "I have a bond to share."
   * The sender's display name is shown to nearby receivers.
   * The bond URL is sent automatically on connection.
   */
  async startSending(
    displayName: string,
    bondUrl: string,
    onPeerConnected?: (peer: NearbyPeer) => void,
  ): Promise<void> {
    if (!isNative) return;
    await this.initialize();

    currentBondUrl = bondUrl;
    const plugin = await getPlugin();

    // Listen for incoming connection requests
    const connListener = await plugin.addListener(
      'connectionResult',
      async (result: any) => {
        if (result.status === 'connected' && currentBondUrl) {
          console.log('[nearby-bond] Peer connected, sending bond URL');
          triggerHaptic(ImpactStyle.Medium);

          // Send the bond URL to the connected peer
          try {
            await plugin.sendMessage({
              endpointId: result.endpointId,
              message: currentBondUrl,
            });
            triggerNotificationHaptic(NotificationType.Success);
            onPeerConnected?.({
              endpointId: result.endpointId,
              displayName: result.endpointName ?? 'Unknown',
            });
          } catch (err) {
            console.warn('[nearby-bond] Failed to send bond URL:', err);
          }
        }
      },
    );
    activeListeners.push(connListener);

    // Start advertising
    await plugin.startAdvertising({ displayName });
    console.log('[nearby-bond] Advertising as:', displayName);
  },

  /**
   * Start discovering: "I'm looking for someone bonding nearby."
   * Calls onPeerFound when a nearby sender is discovered.
   */
  async startReceiving(
    onPeerFound: PeerFoundCallback,
    onBondReceived: BondReceivedCallback,
  ): Promise<void> {
    if (!isNative) return;
    await this.initialize();

    const plugin = await getPlugin();

    // Listen for discovered endpoints
    const discoverListener = await plugin.addListener(
      'endpointFound',
      (event: any) => {
        console.log('[nearby-bond] Found peer:', event.endpointId, event.endpointName);
        triggerHaptic(ImpactStyle.Light);
        onPeerFound({
          endpointId: event.endpointId,
          displayName: event.endpointName ?? 'Someone nearby',
        });
      },
    );
    activeListeners.push(discoverListener);

    // Listen for lost endpoints
    const lostListener = await plugin.addListener(
      'endpointLost',
      (event: any) => {
        console.log('[nearby-bond] Lost peer:', event.endpointId);
      },
    );
    activeListeners.push(lostListener);

    // Listen for incoming bond URL messages
    const messageListener = await plugin.addListener(
      'message',
      (event: any) => {
        console.log('[nearby-bond] Received bond URL:', event.data);
        triggerNotificationHaptic(NotificationType.Success);
        onBondReceived(event.data);
      },
    );
    activeListeners.push(messageListener);

    // Start discovery
    await plugin.startDiscovery();
    console.log('[nearby-bond] Discovering nearby...');
  },

  /**
   * Accept a discovered peer's connection request.
   */
  async connectToPeer(endpointId: string): Promise<void> {
    if (!isNative) return;
    const plugin = await getPlugin();
    triggerHaptic(ImpactStyle.Medium);

    try {
      await plugin.connect({ endpointId });
      console.log('[nearby-bond] Connecting to:', endpointId);
    } catch (err) {
      console.warn('[nearby-bond] Connect failed:', err);
    }
  },

  /**
   * Stop all advertising, discovery, and clean up listeners.
   */
  async stop(): Promise<void> {
    if (!isNative || !isInitialized) return;

    try {
      const plugin = await getPlugin();
      await plugin.stopAdvertising().catch(() => {});
      await plugin.stopDiscovery().catch(() => {});
    } catch {
      // Plugin may not be initialized
    }

    // Remove all listeners
    for (const listener of activeListeners) {
      try {
        listener.remove();
      } catch {
        // Ignore cleanup errors
      }
    }
    activeListeners = [];
    currentBondUrl = null;
    console.log('[nearby-bond] Stopped');
  },
};
